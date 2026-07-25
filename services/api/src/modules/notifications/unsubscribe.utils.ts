import crypto from 'node:crypto'
import { env } from '../../config/env'

const SECRET = env.JWT_ACCESS_SECRET

export function generateUnsubscribeToken(userId: string, notificationType: string): string {
  const payload = `${userId}:${notificationType}`
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
  const token = Buffer.from(`${payload}:${hmac}`).toString('base64url')
  return token
}

export function verifyUnsubscribeToken(token: string): { userId: string; notificationType: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8')
    const parts = decoded.split(':')
    if (parts.length !== 3) return null

    const [userId, notificationType, expectedHmac] = parts
    const payload = `${userId}:${notificationType}`
    const actualHmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')

    if (crypto.timingSafeEqual(Buffer.from(actualHmac), Buffer.from(expectedHmac))) {
      return { userId, notificationType }
    }
    return null
  } catch (err) {
    return null
  }
}
