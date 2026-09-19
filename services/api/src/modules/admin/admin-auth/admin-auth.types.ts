export type AdminRole = 'SUPER_ADMIN' | 'FINANCE' | 'SUPPORT' | 'READONLY'

export interface AdminJwtPayload {
  sub: string           // admin user id
  role: AdminRole
  mfaVerified: true      // literal true — a token is never issued without this
  iss: 'rapto.cloud'
  aud: 'rapto-admin'     // the load-bearing security boundary — never shared with customer tokens
  iat?: number
  exp?: number
}

export interface ChallengeTokenPayload {
  sub: string
  purpose: 'mfa-setup' | 'mfa-challenge'
  iss: 'rapto.cloud'
  aud: 'rapto-admin-challenge'   // deliberately a THIRD audience value — a challenge token must
                                // never be usable as an access token even if someone tries
                                // to replay it against a normal admin route
  iat?: number
  exp?: number
}

export interface LoginResult {
  requiresMfaSetup?: true
  requiresMfaChallenge?: true
  qrCodeDataUrl?: string
  challengeToken?: string
  accessToken?: string
  refreshToken?: string
  adminUser?: { id: string; name: string; email: string; role: AdminRole }
}
