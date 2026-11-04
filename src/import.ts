import type { Model, Protocol } from "./catalog"

const all: Protocol[] = ["openai", "openai-response", "anthropic", "gemini"]
const conversational: Protocol[] = ["openai", "openai-response", "anthropic"]
const google: Protocol[] = ["gemini"]
export const clients = {
  codex: { label: "Codex", protocols: conversational },
  claude: { label: "Claude Code", protocols: all },
  opencode: { label: "OpenCode", protocols: all },
  gemini: { label: "Gemini CLI", protocols: google },
  agy: { label: "Antigravity CLI", protocols: google },
  grokbuild: { label: "Grok Build", protocols: conversational },
  openclaw: { label: "OpenClaw", protocols: all },
  hermes: { label: "Hermes", protocols: conversational },
  pi: { label: "Pi", protocols: all },
}
export type App = keyof typeof clients
export function parseApp(value: unknown): App {
  if (typeof value !== "string" || !Object.hasOwn(clients, value)) throw new Error("Unsupported client")
  return value as App
}
const formats: Record<Protocol, string> = { openai: "openai_chat", "openai-response": "openai_responses", anthropic: "anthropic", gemini: "gemini_native" }
export function importLink(origin: string, key: string, site: string, app: App, model: Model, protocol: Protocol, effort?: string) {
  if (!model.protocols.includes(protocol)) throw new Error("Model does not support this protocol")
  if (!clients[app].protocols.includes(protocol)) throw new Error("Client does not support this protocol")
  if (effort && (app !== "codex" || !["openai", "openai-response"].includes(protocol) || !model.efforts.includes(effort))) throw new Error("This effort cannot be imported for this client")
  const root = `${origin}/relay/${site}/${protocol}`
  const endpoint = root + (protocol === "gemini"
    ? ["opencode", "openclaw", "pi"].includes(app) ? "/v1beta" : ""
    : protocol === "anthropic" ? ["opencode", "openclaw"].includes(app) ? "/v1" : "" : "/v1")
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
