import { randomBytes } from "node:crypto"
import type { Auth } from "./contracts"
import { authorize } from "./oauth"
import { models, type Model, type Protocol, parseProtocol } from "./catalog"
import { Store, sites, type Site } from "./store"
import { endpoint, identityHeaders, json, record, request, text } from "./http"
import { applyReset, fetchAccount, prepareReset, type ResetConfirmation } from "./account"
import { importLink } from "./import"

export interface ServerOptions { directory: string; port?: number; callback?: string; sites?: Record<string, Site> }
export async function start(options: ServerOptions) {
  const store = new Store(options.directory, options.sites ?? sites)
  const session = randomBytes(32).toString("base64url")
  const confirmations = new Map<string, { site: string; value: ResetConfirmation; result?: Promise<unknown> }>()
  let login: { controller: AbortController; site: string; status: string; url?: string; done?: Promise<void> } | undefined
  let ready = false
  // Bind before loading credentials: the fixed production port also excludes a
  // second daemon from rotating the same refresh token concurrently.
  const server = Bun.serve({
    hostname: "127.0.0.1", port: options.port ?? 3489, idleTimeout: 0,
    maxRequestBodySize: 32 * 1024 * 1024,
    async fetch(req): Promise<Response> {
      const url = new URL(req.url)
      const origin = `http://127.0.0.1:${server.port}`
      const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } })
      if (url.host !== new URL(origin).host) return reply({ error: "Invalid host" }, 403)
      if (!ready) return reply({ error: "Starting DimAgent" }, 503)
      const source = req.headers.get("origin")
      if (source && source !== origin) return reply({ error: "Invalid origin" }, 403)
      try {
        if (url.pathname.startsWith("/relay/")) return await relay(req, url)
        if (req.method === "GET" && url.pathname === "/") {
          const html = await Bun.file(new URL("../page/index.html", import.meta.url)).text()
          return new Response(html.replace("__SESSION__", session), { headers: {
            "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
            "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
          } })
        }
        if (req.method === "GET" && ["/account.js", "/account.css", "/icon.png"].includes(url.pathname)) {
          return new Response(Bun.file(new URL(`../page${url.pathname}`, import.meta.url)), { headers: { "Content-Type": url.pathname.endsWith(".js") ? "text/javascript; charset=utf-8" : url.pathname.endsWith(".png") ? "image/png" : "text/css; charset=utf-8" } })
        }
        if (req.method !== "POST" || req.headers.get("x-dim-session") !== session || !req.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "Unauthorized account request" }, 403)
        const body = record(await req.json(), "account request")
        if (url.pathname === "/api/state") return reply({
          sites: Object.entries(store.sites).map(([id, site]) => ({ id, label: site.label, issuer: site.issuer, account: store.accounts[id]?.accountId })),
          login: login ? { site: login.site, status: login.status } : undefined,
        })
        if (url.pathname === "/api/login/cancel") {
          login?.controller.abort()
          await login?.done
          login = undefined
          return reply({ ok: true })
        }
        const site = text(body.site, "site")
        if (!Object.hasOwn(store.sites, site)) throw new Error("Unknown DimAgent site")
        if (url.pathname === "/api/login") {
          if (login?.status === "pending") throw new Error("Complete or cancel the pending sign-in first")
          const controller = new AbortController()
          const flow = await authorize({ ...store.sites[site], redirectUri: options.callback ?? "http://127.0.0.1:54322/oauth/callback", scope: "openid profile email" }, controller.signal)
          const current = { controller, site, status: "pending", url: flow.url, done: undefined as Promise<void> | undefined }
          login = current
          current.done = (async () => {
            const result = await flow.callback()
            if (result.type === "failed") { current.status = result.error; return }
            await store.put(site, { ...result, type: "oauth" })
            current.status = "success"
          })().catch(() => { current.status = "Could not save sign-in" })
          return reply({ url: flow.url })
        }
        if (url.pathname === "/api/logout") {
          if (login?.site === site) { login.controller.abort(); await login.done; login = undefined }
          await store.logout(site)
          for (const [id, value] of confirmations) if (value.site === site) confirmations.delete(id)
          return reply({ ok: true })
        }
        const auth = await store.auth(site)
        if (url.pathname === "/api/models") return reply({ models: await catalog(auth) })
        if (url.pathname === "/api/view") return reply(await fetchAccount(auth))
        if (url.pathname === "/api/import") {
          const model = (await catalog(auth)).find(model => model.id === body.model)
          if (!model) throw new Error("Model no longer available; refresh the catalog")
          const app = text(body.app, "client")
          if (app !== "claude" && app !== "codex" && app !== "opencode") throw new Error("Unsupported client")
          const protocol = parseProtocol(body.protocol)
          if (!model.protocols.includes(protocol)) throw new Error("Unsupported model protocol")
          const effort = body.effort === undefined || body.effort === "" ? undefined : text(body.effort, "effort")
          return reply({ url: importLink(origin, store.key, site, app, model, protocol, effort) })
        }
        if (url.pathname === "/api/reset/prepare") {
          if (body.kind !== "window" && body.kind !== "monthly_full") throw new Error("Unknown reset type")
          for (const [id, entry] of confirmations) if (entry.value.expires < Date.now()) confirmations.delete(id)
          const value = await prepareReset(auth, body.kind)
          confirmations.set(value.id, { site, value })
          return reply({ confirmation: value.id, kind: value.kind, account: auth.accountId, issuer: auth.issuer, subscriptionId: value.subscriptionId, plan: value.view.plan?.name, available: value.available, batches: value.batches, detailsUnavailable: value.detailsUnavailable })
        }
        if (url.pathname === "/api/reset/apply") {
          const entry = confirmations.get(text(body.confirmation, "confirmation"))
          if (!entry || entry.site !== site || entry.value.expires < Date.now()) throw new Error("Reset confirmation expired; confirm again")
          if (!entry.result) {
            const task = applyReset(auth, entry.value)
            entry.result = task
            void task.catch(() => { if (entry.result === task) entry.result = undefined })
          }
          return reply(await entry.result)
        }
        return reply({ error: "Not found" }, 404)
      } catch (error) {
        return reply({ error: error instanceof Error ? error.message : "DimAgent operation failed" }, 400)
      }
    },
  })
  async function catalog(auth: Auth): Promise<Model[]> {
    return models(await json(await request(`${auth.issuer}/v1/models?type=dim`, { headers: identityHeaders(auth.access) }), "Dim models"))
  }
  async function relay(req: Request, url: URL): Promise<Response> {
    const denied = () => Response.json({ error: { message: "Unauthorized local relay request" } }, { status: 401 })
    const supplied = req.headers.get("authorization")?.replace(/^Bearer /i, "") ?? req.headers.get("x-api-key") ?? req.headers.get("x-goog-api-key") ?? url.searchParams.get("key")
    if (supplied !== store.key) return denied()
    const match = /^\/relay\/([a-z]+)\/(openai|openai-response|anthropic|gemini)(\/.*)$/.exec(url.pathname)
    if (!match || !Object.hasOwn(store.sites, match[1]!)) return new Response("Not found", { status: 404 })
    const site = match[1]!
    const protocol = parseProtocol(match[2])
    const path = match[3]!
    const auth = await store.auth(site)
    const available = (await catalog(auth)).filter(model => model.protocols.includes(protocol))
    if (req.method === "GET" && path === "/v1/models") return Response.json({ object: "list", data: available.map(model => ({ id: model.id, object: "model", owned_by: "dimagent", name: model.name + (model.zdr ? " · ZDR" : "") })) })
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })
    const body = record(await req.json(), "model request")
    let upstreamPath: string
    if (protocol === "gemini") {
      const selected = available.find(model => path === `/v1beta/models/${model.id}:generateContent` || path === `/v1beta/models/${model.id}:streamGenerateContent`)
      if (!selected) throw new Error("Unknown Gemini model or action")
      upstreamPath = path
    } else {
      const expected = { openai: "/v1/chat/completions", "openai-response": "/v1/responses", anthropic: "/v1/messages" }[protocol]
      if (path !== expected) return new Response("Not found", { status: 404 })
      if (!available.some(model => model.id === body.model)) throw new Error("Model does not support this protocol")
      upstreamPath = expected
    }
    // Pin the origin and discard the local key. Never forward arbitrary paths,
    // client cookies or credentials, and never replay a paid request on 401.
    const target = new URL(endpoint(`${auth.issuer}${upstreamPath}`, auth.issuer, "relay target"))
    const query = new URLSearchParams(url.search)
    query.delete("key")
    target.search = query.toString()
    const headers = identityHeaders(auth.access)
    headers.set("Content-Type", "application/json")
    for (const name of ["anthropic-version", "anthropic-beta", "accept"]) {
      const value = req.headers.get(name)
      if (value) headers.set(name, value)
    }
    let response: Response
    try { response = await fetch(target, { method: "POST", headers, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.any([req.signal, AbortSignal.timeout(600_000)]) }) }
    catch { return Response.json({ error: { message: "DimAgent relay disconnected or timed out" } }, { status: 502 }) }
    const output = new Headers({ "Cache-Control": "no-store" })
    for (const name of ["content-type", "retry-after", "x-request-id"]) {
      const value = response.headers.get(name)
      if (value) output.set(name, value)
    }
    return new Response(response.body, { status: response.status, headers: output })
  }
  try { await store.load(); ready = true } catch (error) { await server.stop(true); throw error }
  return {
    server, store,
    async stop() { login?.controller.abort(); await login?.done; await server.stop(true) },
  }
}
