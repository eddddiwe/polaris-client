import { readJson, writeJson } from './fsutil'
import { join } from 'node:path'
import type { Friend } from '../shared/types'

interface FriendFile {
  friends: Friend[]
}

export class FriendStore {
  private data: FriendFile = { friends: [] }

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    const loaded = await readJson<FriendFile | null>(this.path, null)
    if (loaded && Array.isArray(loaded.friends)) this.data = loaded
  }

  async save(): Promise<void> {
    await writeJson(this.path, this.data)
  }

  list(): Friend[] {
    return [...this.data.friends].sort((a, b) => a.name.localeCompare(b.name))
  }

  async add(code: string, name: string): Promise<Friend> {
    const cleanCode = code.trim().toUpperCase()
    const cleanName = name.trim() || cleanCode
    const existing = this.data.friends.find((f) => f.code === cleanCode)
    if (existing) {
      existing.name = cleanName
      await this.save()
      return existing
    }
    const friend: Friend = { code: cleanCode, name: cleanName, addedAt: Date.now() }
    this.data.friends.push(friend)
    await this.save()
    return friend
  }

  async remove(code: string): Promise<void> {
    this.data.friends = this.data.friends.filter((f) => f.code !== code.trim().toUpperCase())
    await this.save()
  }

  has(code: string): boolean {
    return this.data.friends.some((f) => f.code === code.trim().toUpperCase())
  }
}

export function createFriendStore(root: string): FriendStore {
  return new FriendStore(join(root, 'friends.json'))
}
