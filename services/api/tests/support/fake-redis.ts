// Minimal in-memory stand-in for the ioredis surface the billing code uses. No network, no shared state.
export function createFakeRedis() {
  const store = new Map<string, { v: string; exp: number | null }>()
  const windows = new Map<string, number[]>()
  const alive = (k: string) => {
    const e = store.get(k)
    if (!e) return undefined
    if (e.exp !== null && e.exp <= Date.now()) {
      store.delete(k)
      return undefined
    }
    return e
  }
  return {
    _store: store,
    async get(k: string) {
      return alive(k)?.v ?? null
    },
    async set(k: string, v: string, ...args: any[]) {
      const nx = args.includes('NX')
      const exIdx = args.indexOf('EX')
      if (nx && alive(k)) return null
      store.set(k, { v, exp: exIdx >= 0 ? Date.now() + Number(args[exIdx + 1]) * 1000 : null })
      return 'OK'
    },
    async setex(k: string, ttl: number, v: string) {
      store.set(k, { v, exp: Date.now() + ttl * 1000 })
      return 'OK'
    },
    async del(...keys: string[]) {
      let n = 0
      for (const k of keys) if (store.delete(k)) n++
      return n
    },
    async ttl(k: string) {
      const e = alive(k)
      return e && e.exp ? Math.ceil((e.exp - Date.now()) / 1000) : -1
    },
    // billing.service RELEASE_LOCK_LUA: delete only if the token matches
    async eval(_script: string, _n: number, key: string, token: string) {
      if (alive(key)?.v === token) {
        store.delete(key)
        return 1
      }
      return 0
    },
    // rate-limit sliding window (script / evalsha)
    async script() {
      return 'fake-sha'
    },
    async evalsha(_sha: string, _n: number, key: string, now: string, windowMs: string, limit: string) {
      const n = Number(now)
      const w = Number(windowMs)
      const l = Number(limit)
      const arr = (windows.get(key) ?? []).filter((t) => t > n - w)
      if (arr.length >= l) {
        windows.set(key, arr)
        return [0, l - arr.length, arr[0] + w]
      }
      arr.push(n)
      windows.set(key, arr)
      return [1, l - arr.length, n + w]
    },
    on() {
      return this
    },
    quit: async () => 'OK',
  }
}
