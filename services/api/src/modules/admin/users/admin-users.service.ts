import { adminUsersRepository as repo } from './admin-users.repository'
import { decodeCursor, toPage } from './keyset'
import type { ListUsersQuery, ListTeamsQuery } from './admin-users.validator'

export const adminUsersService = {
  async listUsers(q: ListUsersQuery) {
    const rows = await repo.listUsers({ ...q, cursor: decodeCursor(q.cursor, q.sortBy) })
    const { items, nextCursor, hasMore } = toPage(rows, q.limit, q.sortBy)
    return { users: items, nextCursor, hasMore }
  },

  async listTeams(q: ListTeamsQuery) {
    const rows = await repo.listTeams({ ...q, cursor: decodeCursor(q.cursor, q.sortBy) })
    const { items, nextCursor, hasMore } = toPage(
      // BigInt is not JSON-serializable — cents fit comfortably in a JS number.
      rows.map((r) => ({ ...r, mrrCents: Number(r.mrrCents) })),
      q.limit,
      q.sortBy,
    )
    return { teams: items, nextCursor, hasMore }
  },
}
