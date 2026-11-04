import type { Model, Protocol } from "./catalog"

export type App = "claude" | "codex" | "opencode"
const formats: Record<Protocol, string> = { openai: "openai_chat", "openai-response": "openai_responses", anthropic: "anthropic", gemini: "gemini_native" }
export function importLink(origin: string, key: string, site: string, app: App, model: Model, protocol: Protocol, effort?: string) {
  if (!model.protocols.includes(protocol)) throw new Error("Model does not support this protocol")
  if (protocol === "gemini" && app !== "opencode") throw new Error("Use OpenCode for Gemini native models")
  if (effort && (app !== "codex" || !["openai", "openai-response"].includes(protocol) || !model.efforts.includes(effort))) throw new Error("This effort cannot be imported for this client")
  const root = `${origin}/relay/${site}/${protocol}`
  const endpoint = root + (protocol === "gemini" ? "/v1beta" : protocol === "anthropic" && app !== "opencode" ? "" : "/v1")
  const url = new URL("ccswitch://v1/import")
  url.search = new URLSearchParams({
    resource: "provider", app, name: `DimAgent · ${model.name}`, endpoint, apiKey: key,
    apiFormat: formats[protocol], model: model.id, homepage: "https://dimagent.cn",
    enabled: "false", notes: `DimAgent ${site === "cn" ? "国内站" : "海外站"} · ${protocol}${model.zdr ? " · ZDR" : ""} · 账户页：${origin}。使用时需保持本地接入程序运行。`,
  }).toString()
  if (app === "claude") for (const field of ["haikuModel", "sonnetModel", "opusModel"]) url.searchParams.set(field, model.id)
  if (app === "codex") {
    url.searchParams.set("configFormat", "toml")
    url.searchParams.set("config", Buffer.from(`model_provider = "dimagent"\n${effort ? `model_reasoning_effort = ${JSON.stringify(effort)}\n` : ""}\n[model_providers.dimagent]\nwire_api = "responses"\n`).toString("base64"))
  }
  return url.href
}
