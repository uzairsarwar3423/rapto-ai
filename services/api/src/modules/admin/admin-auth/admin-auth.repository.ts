import { prisma } from '../../../db/client'

export const adminAuthRepository = {
  findByEmail(email: string) {
    return prisma.adminUser.findUnique({ where: { email } })
  },

  findById(id: string) {
    return prisma.adminUser.findUnique({ where: { id } })
  },

  enableMfa(adminUserId: string, totpSecretEnc: string) {
    return prisma.adminUser.update({
      where: { id: adminUserId },
      data: { mfaEnabled: true, totpSecretEnc },
    })
  },

  setPendingTotpSecret(adminUserId: string, totpSecretEnc: string) {
    // Stored before verification succeeds — mfaEnabled stays false until verifyMfaSetup() confirms
    // the user actually scanned the code correctly, not just that a secret was generated.
    return prisma.adminUser.update({
      where: { id: adminUserId },
      data: { totpSecretEnc },
    })
  },

  updateLastLogin(adminUserId: string) {
    return prisma.adminUser.update({
      where: { id: adminUserId },
      data: { lastLoginAt: new Date() },
    })
  },

  createRefreshToken(data: {
    adminUserId: string
    tokenHash: string
    expiresAt: Date
    ipAddress?: string
    userAgent?: string
  }) {
    return prisma.adminRefreshToken.create({ data })
  },

  findRefreshTokenByHash(tokenHash: string) {
    return prisma.adminRefreshToken.findUnique({ where: { tokenHash } })
  },

  deleteRefreshToken(id: string) {
    return prisma.adminRefreshToken.deleteMany({ where: { id } })
  },

  deleteAllRefreshTokensForUser(adminUserId: string) {
    return prisma.adminRefreshToken.deleteMany({ where: { adminUserId } })
  },
}
