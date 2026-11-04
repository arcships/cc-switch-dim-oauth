import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm, stat, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { start } from "../src/server"

const cleanup: (() => unknown)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
function fixture() {
  const until = new Date(Date.now() + 86400_000).toISOString()
  let challenge = "", redirect = "", rotations = 0, applied = 0, failApply = false, paidStatus = 200, expiry = 3600, paidCalls = 0, modelFailure = false, zdr = true, disconnected = false
  const keys: string[] = [], requests: { path: string; body: any; auth: string | null }[] = []
  const bucket = { total_units: 1000, used_units: 400, window_states: [{ window_duration_hours: 5, window_token_cap: 100, window_token_used: 40, window_expires_at: until }] }
  const resets = { window: { available_count: 3 }, monthly_full: { available_count: 2 } }
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req): Promise<Response> {
    const path = new URL(req.url).pathname
    const origin = server.url.origin
    if (path === "/.well-known/openid-configuration") return Response.json({ issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, userinfo_endpoint: `${origin}/userinfo` })
    if (path === "/token") {
      const form = await req.formData()
      if (form.get('grant_type') === 'authorization_code') {
        expect(form.get('redirect_uri')).toBe(redirect)
        expect(createHash('sha256').update(String(form.get('code_verifier'))).digest('base64url')).toBe(challenge)
      } else { rotations++; await Bun.sleep(25); expect(form.get('refresh_token')).toBe(`refresh-${rotations - 1}`) }
      return Response.json({ token_type: 'Bearer', access_token: `access-${rotations}`, refresh_token: `refresh-${rotations}`, expires_in: expiry })
    }
    if (path === "/userinfo") return Response.json({ sub: 'subject', uid: 'user', email: 'test@example.invalid' })
    requests.push({ path, body: req.method === 'POST' ? await req.json() : undefined, auth: req.headers.get('authorization') })
    if (path === "/v1/models") return modelFailure ? new Response('Unavailable', { status: 503 }) : Response.json({ data: [
      { id: 'vendor/full-model-id', zdr, zdr_supported: true, dim: { display_name: 'Full model', extra_capabilities: { reasoning: { supported: true, effortOptions: ['low', 'high'] } } } },
      { id: 'null-config', dim: null, zdr_supported: true, reasoning_options: [{ type: 'effort', values: ['minimal', 'high'] }] },
      { id: 'messages-id', dim: { endpoint_type: 'anthropic', reasoning: false, reasoning_options: [{ type: 'effort', values: ['high'] }] } },
      { id: 'responses-id', dim: { endpoint_type: 'openai-response' } },
      { id: 'gemini-id', dim: { endpoint_type: 'gemini' } },
      { id: 'unknown-id', dim: { endpoint_type: 'unsupported' } },
    ] })
    if (path === "/api/me/usage") return Response.json({ data: { subscription: { product: { name: 'Pro' }, subscription: { id: 88 }, current_term: { end_at: until } }, credits: { subscription_bucket: bucket, remaining_units: 650 }, resets } })
    if (path === "/api/me/usage-resets") return Response.json({ data: Object.fromEntries(['window', 'monthly_full'].map(kind => [kind, { batches: [{ scope_type: 'subscription', subscription_id: 88, remaining: 3, expires_at: until, source_type: 'purchase' }] }])) })
    if (path === "/api/me/usage-resets/apply") {
      const body = requests.at(-1)!.body
      keys.push(body.idempotency_key)
      const replayed = keys.slice(0, -1).includes(body.idempotency_key)
      if (!replayed) applied++
      if (failApply) { failApply = false; return new Response('Lost reply', { status: 503 }) }
      return Response.json({ data: { replayed, applied_at: new Date().toISOString(), bucket, window_states: bucket.window_states, resets } })
    }
    if (path === '/v1/chat/completions' || path === '/v1/responses' || path === '/v1/messages' || path.startsWith('/v1beta/')) {
      paidCalls++
      if (paidStatus !== 200) return new Response('Rate limited', { status: paidStatus, headers: { 'Retry-After': '10' } })
      const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"id":"mock","choices":[{"delta":{"tool_calls":[{"id":"tool","function":{"name":"read","arguments":"{}"}}]}}]}\n\n')); }, cancel() { disconnected = true } })
      if (requests.at(-1)!.body?.stream === false) return Response.json({ id: 'mock' })
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
    }
    return new Response('Not found', { status: 404 })
  } })
  cleanup.push(() => server.stop(true))
  return { server, requests, keys, get rotations() { return rotations }, get applied() { return applied }, get paidCalls() { return paidCalls }, get disconnected() { return disconnected }, set expiry(value: number) { expiry = value }, set paidStatus(value: number) { paidStatus = value }, set modelFailure(value: boolean) { modelFailure = value }, set zdr(value: boolean) { zdr = value }, failNextApply() { failApply = true }, auth(url: URL) { challenge = url.searchParams.get('code_challenge')!; redirect = url.searchParams.get('redirect_uri')! } }
}
async function setup() {
  const remote = fixture()
  const directory = await mkdtemp(join(tmpdir(), 'cc-dim-flow-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const app = await start({ directory, port: 0, callback: 'http://127.0.0.1:0/oauth/callback', sites: { cn: { issuer: remote.server.url.origin, clientId: 'test-public', label: 'Test' } } })
  cleanup.push(() => app.stop())
  const origin = app.server.url.origin
  const html = await (await fetch(origin)).text()
  const session = /name="dim-session" content="([^"]+)"/.exec(html)![1]!
  const post = async (path: string, body: any = {}) => {
    const response = await fetch(`${origin}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dim-session': session }, body: JSON.stringify({ site: 'cn', ...body }) })
    return { status: response.status, data: await response.json() as any }
  }
  async function login() {
    const result = await post('login')
    expect(result.status).toBe(200)
    const url = new URL(result.data.url)
    remote.auth(url)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('client_id')).toBe('test-public')
    expect(url.searchParams.get('scope')).toBe('openid profile email')
    const callback = new URL(url.searchParams.get('redirect_uri')!)
    callback.search = new URLSearchParams({ state: url.searchParams.get('state')!, code: 'test-code' }).toString()
    expect((await fetch(callback)).status).toBe(200)
    for (let i = 0; i < 100; i++) {
      const value = await post('state')
      if (value.data.login?.status === 'success') return
      await Bun.sleep(10)
    }
    throw new Error('Mock login did not finish')
  }
  const relay = (path: string, body: any, protocol = 'openai') => fetch(`${origin}/relay/cn/${protocol}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${app.store.key}`, 'x-api-key': 'caller-key' }, body: JSON.stringify(body) })
  return { remote, app, origin, post, login, relay, directory, session }
}

test('PKCE sign-in, persisted login, full catalog, ZDR, usage, client imports and logout', async () => {
  const f = await setup(); await f.login()
  expect((await stat(join(f.directory, 'auth.json'))).mode & 0o777).toBe(0o600)
  expect((await stat(f.directory)).mode & 0o777).toBe(0o700)
  const catalog = (await f.post('models')).data.models
  expect(catalog.map((model: any) => model.id)).toEqual(['vendor/full-model-id', 'null-config', 'messages-id', 'responses-id', 'gemini-id'])
  expect(catalog[0].efforts).toEqual(['low', 'high']); expect(catalog[0].zdr).toBe(true); expect(catalog[1].zdr).toBe(false)
  expect(catalog[1].efforts).toEqual(['minimal', 'high']); expect(catalog[2].efforts).toEqual([])
  f.remote.zdr = false; expect((await f.post('models')).data.models[0].zdr).toBe(false)
  const view = (await f.post('view')).data
  expect(view.windows.find((value: any) => value.name === 'Credits')).toMatchObject({ amount: 650 })
  expect(view.windows.find((value: any) => value.name === 'Credits').used).toBeUndefined()
  expect(view.windows.find((value: any) => value.name === 'Subscription').amount).toBe(400)
  for (const app of ['claude', 'codex', 'opencode']) {
    const result = await f.post('import', { app, model: catalog[0].id, protocol: 'openai', ...(app === 'codex' ? { effort: 'low' } : {}) })
    expect(result.status).toBe(200)
    const link = new URL(result.data.url)
    expect(link.protocol).toBe('ccswitch:'); expect(link.searchParams.get('model')).toBe('vendor/full-model-id'); expect(link.searchParams.get('enabled')).toBe('false')
    expect(result.data.url).not.toContain('access-'); expect(result.data.url).not.toContain('refresh-')
    if (app === 'codex') expect(Buffer.from(link.searchParams.get('config')!, 'base64').toString()).toContain('model_reasoning_effort = "low"')
  }
  expect((await f.post('import', { app: 'codex', model: catalog[0].id, protocol: 'anthropic' })).status).toBe(400)
  expect((await f.post('import', { app: 'claude', model: 'gemini-id', protocol: 'gemini' })).status).toBe(400)
  await f.app.stop()
  const restored = await start({ directory: f.directory, port: 0, sites: f.app.store.sites })
  cleanup.push(() => restored.stop())
  expect((await restored.store.auth('cn')).accountId).toBe('test@example.invalid')
  await restored.store.logout('cn'); expect(restored.store.accounts.cn).toBeUndefined()
})

test('wrong and duplicate state are refused; cancellation releases callback listener', async () => {
  const f = await setup()
  const result = await f.post('login'); const url = new URL(result.data.url)
  const callback = new URL(url.searchParams.get('redirect_uri')!); callback.search = 'code=test&state=wrong'
  expect((await fetch(callback)).status).toBe(400)
  callback.search = new URLSearchParams([['code', 'test'], ['state', url.searchParams.get('state')!], ['state', url.searchParams.get('state')!]]).toString()
  expect((await fetch(callback)).status).toBe(400)
  expect((await f.post('login/cancel')).status).toBe(200)
  expect((await f.post('state')).data.sites[0].account).toBeUndefined()
  await f.login()
})

test('concurrent expired-account requests rotate once and persist before use', async () => {
  const f = await setup(); f.remote.expiry = 1; await f.login(); f.remote.expiry = 3600
  const results = await Promise.all([f.post('models'), f.post('view'), f.post('models')])
  expect(results.map(result => result.status)).toEqual([200, 200, 200]); expect(f.remote.rotations).toBe(1)
  expect(JSON.parse(await Bun.file(join(f.directory, 'auth.json')).text()).accounts.cn.refresh).toBe('refresh-1')
  expect(f.remote.requests.every(req => req.auth === 'Bearer access-1')).toBe(true)
  await f.app.store.put('cn', { ...f.app.store.accounts.cn!, expires: 0 })
  await mkdir(join(f.directory, 'auth.json.tmp'))
  expect((await f.post('models')).status).toBe(400)
  expect(f.remote.rotations).toBe(2)
  await rm(join(f.directory, 'auth.json.tmp'), { recursive: true })
  expect((await f.post('models')).status).toBe(200)
  expect(f.remote.rotations).toBe(2)
  expect(JSON.parse(await Bun.file(join(f.directory, 'auth.json')).text()).accounts.cn.refresh).toBe('refresh-2')
})

test('protocol routing preserves full IDs, tool stream and upstream 401/429 without replay', async () => {
  const f = await setup(); await f.login()
  const response = await f.relay('/v1/chat/completions', { model: 'vendor/full-model-id', stream: true, reasoning_effort: 'low' })
  expect(response.status).toBe(200)
  const reader = response.body!.getReader(); const chunk = await reader.read()
  expect(new TextDecoder().decode(chunk.value)).toContain('tool_calls'); await reader.cancel()
  for (let i = 0; i < 30 && !f.remote.disconnected; i++) await Bun.sleep(10)
  expect(f.remote.disconnected).toBe(true)
  expect(f.remote.requests.find(value => value.path === '/v1/chat/completions')).toMatchObject({ auth: 'Bearer access-0', body: { model: 'vendor/full-model-id', reasoning_effort: 'low' } })
  for (const status of [401, 429]) {
    f.remote.paidStatus = status
    const result = await f.relay('/v1/chat/completions', { model: 'vendor/full-model-id', stream: false })
    expect(result.status).toBe(status); expect(result.headers.get('retry-after')).toBe('10')
  }
  expect(f.remote.paidCalls).toBe(3)
  expect((await f.relay('/v1/responses', { model: 'vendor/full-model-id' })).status).toBe(404)
  f.remote.paidStatus = 200
  for (const [protocol, path, model] of [['anthropic', '/v1/messages', 'messages-id'], ['openai-response', '/v1/responses', 'responses-id'], ['gemini', '/v1beta/models/gemini-id:generateContent', undefined]]) {
    expect((await f.relay(path!, { model, stream: false }, protocol)).status).toBe(200)
  }
  expect((await f.relay('/v1/chat/completions', { model: 'messages-id' })).status).toBe(400)
})

test('reset requires confirmation; duplicate execution and lost reply retry use one idempotency key', async () => {
  const f = await setup(); await f.login()
  expect((await f.post('reset/apply', { confirmation: 'invented' })).status).toBe(400)
  for (const kind of ['window', 'monthly_full']) {
    const review = await f.post('reset/prepare', { kind })
    expect(review.data).toMatchObject({ subscriptionId: 88, available: kind === 'window' ? 3 : 2 })
    const before = f.remote.applied
    const result = await Promise.all([f.post('reset/apply', { confirmation: review.data.confirmation }), f.post('reset/apply', { confirmation: review.data.confirmation })])
    expect(result.map(value => value.status)).toEqual([200, 200]); expect(f.remote.applied).toBe(before + 1)
  }
  const review = await f.post('reset/prepare', { kind: 'window' }); f.remote.failNextApply()
  expect((await f.post('reset/apply', { confirmation: review.data.confirmation })).status).toBe(400)
  const applied = f.remote.applied
  expect((await f.post('reset/apply', { confirmation: review.data.confirmation })).data.replayed).toBe(true)
  expect(f.remote.applied).toBe(applied); expect(f.remote.keys.at(-1)).toBe(f.remote.keys.at(-2))
  await f.post('logout'); await f.login()
  expect((await f.post('reset/apply', { confirmation: review.data.confirmation })).status).toBe(400)
})

test('account CSRF, host checks, relay credentials and catalog failure fail closed', async () => {
  const f = await setup(); await f.login()
  expect((await fetch(`${f.origin}/api/view`, { method: 'POST', body: '{}' })).status).toBe(403)
  expect((await fetch(`${f.origin}/api/view`, { method: 'POST', headers: { Origin: 'https://example.invalid', 'x-dim-session': f.session, 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(403)
  expect((await fetch(f.origin, { headers: { Host: 'evil.invalid' } })).status).toBe(403)
  expect((await fetch(`${f.origin}/relay/cn/openai/v1/models`)).status).toBe(401)
  f.remote.modelFailure = true
  expect((await f.post('models')).status).toBe(400)
  expect((await f.relay('/v1/chat/completions', { model: 'vendor/full-model-id' })).status).toBe(400)
  expect(f.remote.paidCalls).toBe(0)
})

test('site credentials stay isolated and stale account confirmations cannot reset another account', async () => {
  const f = await setup(); await f.login()
  const second = fixture()
  const directory = await mkdtemp(join(tmpdir(), 'cc-dim-sites-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const app = await start({ directory, port: 0, sites: {
    cn: { issuer: f.remote.server.url.origin, clientId: 'test-cn', label: 'CN' },
    global: { issuer: second.server.url.origin, clientId: 'test-global', label: 'Global' },
  } })
  cleanup.push(() => app.stop())
  for (const [site, remote, access] of [['cn', f.remote, 'site-cn'], ['global', second, 'site-global']] as const) {
    await app.store.put(site, { type: 'oauth', access, refresh: 'mock-refresh', expires: Date.now() + 3600000, issuer: remote.server.url.origin, tokenEndpoint: `${remote.server.url.origin}/token`, clientId: `test-${site}`, accountId: 'same@example.invalid', uid: JSON.stringify([remote.server.url.origin, 'user']) })
    const response = await fetch(`${app.server.url.origin}/relay/${site}/openai/v1/models`, { headers: { Authorization: `Bearer ${app.store.key}` } })
    expect(response.status).toBe(200)
    expect(remote.requests.at(-1)!.auth).toBe(`Bearer ${access}`)
  }
  const review = await f.post('reset/prepare', { kind: 'window' })
  await f.app.store.put('cn', { ...f.app.store.accounts.cn!, accountId: 'new@example.invalid', uid: 'another-subject' })
  expect((await f.post('reset/apply', { confirmation: review.data.confirmation })).status).toBe(400)
  expect(f.remote.applied).toBe(0)
})
