import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeServersDat, ensureServersDat } from '../src/core/nbt'

type NbtValue = number | string | NbtValue[] | { [key: string]: NbtValue }

function readString(buf: Buffer, cursor: { at: number }): string {
  const length = buf.readUInt16BE(cursor.at)
  cursor.at += 2
  const value = buf.toString('utf8', cursor.at, cursor.at + length)
  cursor.at += length
  return value
}

function readPayload(buf: Buffer, cursor: { at: number }, type: number): NbtValue {
  switch (type) {
    case 1:
      return buf.readInt8(cursor.at++)
    case 8:
      return readString(buf, cursor)
    case 9: {
      const elementType = buf.readUInt8(cursor.at++)
      const count = buf.readInt32BE(cursor.at)
      cursor.at += 4
      const list: NbtValue[] = []
      for (let i = 0; i < count; i++) list.push(readPayload(buf, cursor, elementType))
      return list
    }
    case 10: {
      const compound: { [key: string]: NbtValue } = {}
      for (;;) {
        const tagType = buf.readUInt8(cursor.at++)
        if (tagType === 0) return compound
        const name = readString(buf, cursor)
        compound[name] = readPayload(buf, cursor, tagType)
      }
    }
    default:
      throw new Error(`Unsupported NBT tag type ${type}`)
  }
}

function decodeServersDat(buf: Buffer): { [key: string]: NbtValue } {
  const cursor = { at: 0 }
  const rootType = buf.readUInt8(cursor.at++)
  if (rootType !== 10) throw new Error(`Unexpected root tag ${rootType}`)
  readString(buf, cursor)
  const root = readPayload(buf, cursor, rootType) as { [key: string]: NbtValue }
  if (cursor.at !== buf.length) throw new Error('Trailing bytes after NBT root')
  return root
}

const cobbleclash = {
  name: 'CobbleClash',
  ip: 'cobbleclash.kinetic.host',
  icon: '',
  acceptTextures: 1
}

describe('servers.dat encoding', () => {
  it('encodes direct server compounds as uncompressed NBT', () => {
    const data = encodeServersDat([
      { name: 'CobbleClash', ip: 'cobbleclash.kinetic.host', icon: '', acceptTextures: true }
    ])
    expect(data.subarray(0, 2)).not.toEqual(Buffer.from([0x1f, 0x8b]))
    expect(decodeServersDat(data)).toEqual({ servers: [cobbleclash] })
  })

  it('creates a decodable servers.dat when missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-nbt-'))
    try {
      await ensureServersDat(dir)
      expect(decodeServersDat(await readFile(join(dir, 'servers.dat')))).toEqual({ servers: [cobbleclash] })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps an existing servers.dat untouched', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'polaris-nbt-'))
    try {
      const existing = encodeServersDat([{ name: 'Existing', ip: 'example.org' }])
      await writeFile(join(dir, 'servers.dat'), existing)
      await ensureServersDat(dir)
      expect(await readFile(join(dir, 'servers.dat'))).toEqual(existing)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
