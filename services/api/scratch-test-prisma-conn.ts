import { prisma } from './src/db/client'

async function main() {
    console.log('Testing prisma client connection with updated connection_limit...')
    try {
        await prisma.$connect()
        console.log('✅ Prisma connected successfully!')
        const res = await prisma.$queryRaw`SELECT 1 as result`
        console.log('Query result:', res)
    } catch (err) {
        console.error('❌ Connection error:', err)
    } finally {
        await prisma.$disconnect()
    }
}

main()
