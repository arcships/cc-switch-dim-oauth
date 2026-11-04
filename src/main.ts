import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { start } from "./server"

const directory = process.env.DIM_CC_STATE_DIR ? resolve(process.env.DIM_CC_STATE_DIR) : join(homedir(), ".local", "share", "cc-switch-dim-oauth")
try {
  const app = await start({ directory })
  console.log(`DimAgent: http://127.0.0.1:${app.server.port}`)
  console.log("Keep this process running while using the imported provider. Press Ctrl+C to stop.")
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void app.stop().then(() => process.exit(0)) })
} catch {
  console.error("Could not start DimAgent. Check port 3489 and the credential directory permissions.")
  process.exitCode = 1
}
