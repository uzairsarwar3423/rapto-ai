import { PrismaClient } from '@prisma/client'

/**
 * Enterprise Production DB Client Configuration
 *
 * Automatically appends connection_limit=3 in production if not explicitly set
 * to prevent PgBouncer EMAXCONNSESSION (pool limit 15) crashes.
 */
function getDatasourceUrl(): string | undefined {
    const rawUrl = process.env.DATABASE_URL
    if (!rawUrl) return undefined

    const maxConn = process.env.PRISMA_CONNECTION_LIMIT || '3'
    if (rawUrl.includes('connection_limit=')) {
        return rawUrl.replace(/connection_limit=\d+/, `connection_limit=${maxConn}`)
    }
    const delimiter = rawUrl.includes('?') ? '&' : '?'
    return `${rawUrl}${delimiter}connection_limit=${maxConn}`
}

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        datasources: {
            db: {
                url: getDatasourceUrl(),
            },
        },
        log: process.env.NODE_ENV === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
    })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma