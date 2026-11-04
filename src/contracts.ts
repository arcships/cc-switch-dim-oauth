// Validated DimAgent wire and local persistence contracts.
export interface OAuthOptions {
  issuer?: string
  clientId?: string
  redirectUri?: string
  scope?: string
}

export interface Auth {
  type: "oauth"
  access: string
  refresh: string
  expires: number
  issuer: string
  tokenEndpoint: string
  clientId: string
  accountId: string
  uid: string
}

export interface Window {
  name: string
  source: "subscription" | "account" | "feature"
  used?: number
  display?: string
  amount?: number
  limit?: number
  unit?: string
  span?: number
  resetsAt?: string
  aside?: boolean
}
