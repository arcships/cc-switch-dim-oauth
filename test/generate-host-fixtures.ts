import { importLink, clients } from "../src/import"
import type { Model, Protocol } from "../src/catalog"
const entries = []
for (const app of ["claude", "codex", "opencode", "gemini", "agy", "grokbuild", "openclaw", "hermes", "pi"] as const) {
  for (const protocol of ["openai", "openai-response", "anthropic", "gemini"] as Protocol[]) {
    if (!clients[app].protocols.includes(protocol)) continue
    const model: Model = { id: "vendor/full-model-id", name: `Mock ${app} ${protocol}`, protocols: [protocol], efforts: ["low", "high"], zdr: true }
    entries.push({ app, protocol, url: importLink("http://127.0.0.1:3489", "public-mock-relay-key", "cn", app, model, protocol, app === "codex" && protocol === "openai" ? "low" : undefined) })
  }
}
await Bun.write(new URL("../.state/host-imports.json", import.meta.url), JSON.stringify(entries))
console.log("Generated mock host imports in .state/host-imports.json")
