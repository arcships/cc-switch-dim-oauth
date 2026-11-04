import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import type { Auth } from "./contracts"
import { readAuth, refresh } from "./oauth"
import { record, text } from "./http"

export interface Site { issuer: string; clientId: string; label: string }
export const sites: Record<string, Site> = {
  cn: { issuer: "https://dimagent.cn", clientId: "271706aab9b74b15a7140b228a419e4a", label: "国内站" },
  global: { issuer: "https://dimagent.com", clientId: "91975f99125f42bc88859100a1769ea4", label: "海外站" },
}
export class Store {
  key = ""
  accounts: Record<string, Auth> = {}
  private renewing = new Map<string, Promise<Auth>>()
  constructor(private directory: string, readonly sites: Record<string, Site>) {}
  async load() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await chmod(this.directory, 0o700)
    let raw: unknown
    try { raw = JSON.parse(await readFile(join(this.directory, "auth.json"), "utf8")) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Cannot read saved DimAgent credentials")
      this.key = randomBytes(32).toString("base64url")
      await this.save()
      return
    }
    const data = record(raw, "saved state")
    if (data.version !== 1) throw new Error("Unsupported saved state version")
    this.key = text(data.key, "local relay key")
    for (const [id, value] of Object.entries(record(data.accounts, "saved accounts"))) {
      const auth = readAuth(value)
      const site = this.sites[id]
      if (!site || auth.issuer !== site.issuer || auth.clientId !== site.clientId) throw new Error("Saved OAuth registration mismatch")
      this.accounts[id] = auth
    }
    await chmod(join(this.directory, "auth.json"), 0o600)
  }
  private writing: Promise<void> = Promise.resolve()
  private save() {
    const contents = JSON.stringify({ version: 1, key: this.key, accounts: this.accounts })
    const operation = this.writing.catch(() => {}).then(async () => {
      const target = join(this.directory, "auth.json")
      await writeFile(`${target}.tmp`, contents, { mode: 0o600 })
      await rename(`${target}.tmp`, target)
    })
    this.writing = operation
    return operation
  }
  async put(id: string, auth: Auth) {
    await this.renewing.get(id)?.catch(() => {})
    this.accounts[id] = auth
    await this.save()
  }
  async logout(id: string) {
    // Let an already-started rotation persist before deleting the account.
    await this.renewing.get(id)?.catch(() => {})
    delete this.accounts[id]
    await this.save()
  }
  async auth(id: string): Promise<Auth> {
    const pending = this.renewing.get(id)
    if (pending) return pending
    const operation = (async () => {
      // A failed disk write must be retried before returning rotated tokens.
      await this.writing.catch(() => this.save())
      const auth = this.accounts[id]
      if (!auth) throw new Error("Sign in to DimAgent first")
      if (auth.expires > Date.now() + 30_000) return auth
      const updated = { ...auth, ...await refresh(auth) }
      this.accounts[id] = updated
      await this.save()
      return updated
    })()
    this.renewing.set(id, operation)
    try { return await operation } finally { this.renewing.delete(id) }
  }
}
