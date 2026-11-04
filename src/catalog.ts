import type { Window } from "./contracts"
import { number, record, text } from "./http"

export type Protocol = "openai" | "openai-response" | "anthropic" | "gemini"
export interface Model { id: string; name: string; protocols: Protocol[]; efforts: string[]; zdr: boolean }
export function parseProtocol(value: unknown): Protocol {
  if (value === "openai" || value === "openai-response" || value === "anthropic" || value === "gemini") return value
  throw new Error("Unsupported model protocol")
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Invalid model string list")
  return value.map(item => text(item, "model list entry"))
}
export function models(payload: Record<string, unknown>): Model[] {
  if (!Array.isArray(payload.data)) throw new Error("Invalid Dim model list")
  const seen = new Set<string>()
  return payload.data.flatMap(item => {
    const raw = record(item, "model")
    const id = text(raw.id, "model ID")
    if (seen.has(id)) throw new Error("Duplicate model ID")
    seen.add(id)
    const config = raw.dim == null ? raw : record(raw.dim, "model config")
    if (config.id !== undefined && config.id !== id) throw new Error("Model ID mismatch")
    if (config.status === "unavailable") return []
    const explicit = config.endpoint_type ?? raw.endpointType ?? raw.endpoint_type
    const declared = config.selectableEndpointTypes ?? config.selectable_endpoint_types ?? config.supportedEndpointTypes ?? config.supported_endpoint_types
    const candidates = explicit !== undefined ? [text(explicit, "endpoint type")] : declared !== undefined ? strings(declared) : ["openai"]
    const supported = candidates.filter((value): value is Protocol => ["openai", "openai-response", "anthropic", "gemini"].includes(value))
    if (!supported.length) return []
    const extra = config.extra_capabilities === undefined ? {} : record(config.extra_capabilities, "model capabilities")
    const reasoning = extra.reasoning ?? config.reasoning
    const info = reasoning !== null && typeof reasoning === "object" ? record(reasoning, "reasoning") : undefined
    let wireEfforts: unknown
    if (config.reasoning_options !== undefined) {
      if (!Array.isArray(config.reasoning_options)) throw new Error("Invalid reasoning options")
      wireEfforts = config.reasoning_options.map(value => record(value, "reasoning option")).find(value => value.type === "effort")?.values
    }
    const levels = reasoning === false || info?.supported === false ? undefined : info?.effortOptions ?? info?.effort_options ?? wireEfforts
    return [{ id, name: text(config.displayName ?? config.display_name ?? config.name ?? raw.display_name ?? raw.name ?? id, "model name"), protocols: supported, efforts: levels === undefined ? [] : strings(levels), zdr: raw.zdr === true }]
  })
}

export function usage(payload: Record<string, unknown>, user: string) {
  const data = record(payload.data, "Dim usage data")
  const credits = record(data.credits, "Dim credits")
  const windows: Window[] = []
  const bucket = credits.subscription_bucket === null ? undefined : record(credits.subscription_bucket, "subscription bucket")
  if (bucket) {
    if (bucket.unlimited === true) {
      windows.push({ name: "Subscription", source: "subscription", display: "Unlimited", aside: true })
    } else if (bucket.total_units !== undefined && bucket.used_units !== undefined) {
      const total = number(bucket.total_units, "subscription total")
      const used = number(bucket.used_units, "subscription used")
      if (total > 0) windows.push({ name: "Subscription", source: "subscription", used: used / total * 100, amount: used, limit: total, unit: "units", ...(typeof bucket.expires_at === "string" ? { resetsAt: bucket.expires_at } : {}) })
      else windows.push({ name: "Subscription", source: "subscription", display: "No subscription allowance reported", aside: true })
    }
    // Add-ons may fund requests when the subscription is exhausted, so the total
    // subscription bucket is informational; only account-wide windows route traffic.
    for (const window of windows) window.aside = true
    let states: unknown = bucket.window_states
    if (states === undefined) {
      // The production API also serves the documented legacy single-window tuple.
      const fields = [bucket.window_duration_hours, bucket.window_token_cap, bucket.window_token_used, bucket.window_started_at, bucket.window_expires_at]
      if (fields.every((value) => value === undefined || value === null || value === 0)) states = []
      else if (fields.some((value) => value === undefined)) throw new Error("Invalid Dim usage: incomplete legacy window")
      else states = [bucket]
    }
    if (!Array.isArray(states)) throw new Error("Invalid Dim usage: missing window_states")
    for (const item of states) {
      const state = record(item, "usage window")
      const limit = number(state.window_token_cap, "window limit")
      const used = number(state.window_token_used, "window used")
      const hours = number(state.window_duration_hours, "window duration")
      const expiry = state.window_expires_at
      if (expiry !== null && (typeof expiry !== "string" || !Number.isFinite(Date.parse(expiry)))) {
        throw new Error("Invalid Dim usage: window expiry")
      }
      if (limit > 0) windows.push({
        name: `${hours}h window`, source: "subscription", used: used / limit * 100, amount: used, limit, unit: "tokens", span: hours * 3600,
        ...(typeof expiry === "string" ? { resetsAt: expiry } : {}),
        // A subscription window does not describe add-on eligibility.
        aside: true,
      })
    }
  }
  if (credits.remaining_units !== undefined && bucket?.unlimited !== true) {
    const remaining = number(credits.remaining_units, "remaining units")
    windows.push({ name: "Credits", source: "account", amount: remaining, unit: "units", display: `${remaining} units remaining`, aside: true })
  }
  if (data.feature_meters !== undefined) {
    if (!Array.isArray(data.feature_meters)) throw new Error("Invalid feature meters")
    for (const item of data.feature_meters) {
      const meter = record(item, "feature meter")
      const name = text(meter.feature_key, "feature name")
      if (meter.unlimited === true) windows.push({ name, source: "feature", display: "Unlimited", aside: true })
      else if (meter.total_allowance !== undefined && meter.total_used !== undefined) {
        const limit = number(meter.total_allowance, "feature allowance")
        const amount = number(meter.total_used, "feature used")
        windows.push({ name, source: "feature", amount, limit, ...(limit > 0 ? { used: amount / limit * 100 } : {}), aside: true,
          ...(typeof meter.unit === "string" ? { unit: meter.unit } : {}),
          ...(typeof meter.period_end === "string" ? { resetsAt: meter.period_end } : {}) })
      }
    }
  }
  if (!windows.length) windows.push({ name: "Usage", source: "account", display: "No allowance reported", aside: true })
  return { user, windows }
}
