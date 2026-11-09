import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathExists } from './fsutil'

/**
 * Minimal NBT encoder for Minecraft's servers.dat format.
 * Minecraft reads servers.dat as an uncompressed NBT compound.
 */

function writeString(buf: Buffer, offset: number, str: string): number {
  const strBuf = Buffer.from(str, 'utf8')
  buf.writeUInt16BE(strBuf.length, offset)
  strBuf.copy(buf, offset + 2)
  return offset + 2 + strBuf.length
}

function writeByte(buf: Buffer, offset: number, val: number): number {
  buf.writeUInt8(val, offset)
  return offset + 1
}

function writeInt(buf: Buffer, offset: number, val: number): number {
  buf.writeInt32BE(val, offset)
  return offset + 4
}

function writeTag(buf: Buffer, offset: number, type: number, name: string, valueWriter: (buf: Buffer, off: number) => number): number {
  buf.writeUInt8(type, offset)
  offset += 1
  offset = writeString(buf, offset, name)
  offset = valueWriter(buf, offset)
  return offset
}

/**
 * Encode a servers.dat NBT compound with the given server list.
 * Each server: { name, ip, icon?, acceptTextures? }
 */
export function encodeServersDat(servers: { name: string; ip: string; icon?: string; acceptTextures?: boolean }[]): Buffer {
  // Calculate buffer size (generous)
  let size = 1024
  for (const s of servers) {
    size += s.name.length + s.ip.length + (s.icon?.length ?? 0) + 100
  }
  const buf = Buffer.alloc(size)
  let offset = 0

  // Root compound tag (type 10, empty name)
  buf.writeUInt8(10, offset); offset += 1
  offset = writeString(buf, offset, '') // root name

  // "servers" list tag
  offset = writeTag(buf, offset, 9, 'servers', (b, off) => {
    b.writeUInt8(10, off); off += 1 // list type: compound (10)
    off = writeInt(b, off, servers.length) // count
    for (const server of servers) {
      // List elements carry only the compound payload: the list header already
      // declares the element type, and list entries have no name tag.
      // name (string)
      off = writeTag(b, off, 8, 'name', (bb, o) => writeString(bb, o, server.name))
      // ip (string)
      off = writeTag(b, off, 8, 'ip', (bb, o) => writeString(bb, o, server.ip))
      // icon (string)
      off = writeTag(b, off, 8, 'icon', (bb, o) => writeString(bb, o, server.icon ?? ''))
      // acceptTextures (byte)
      off = writeTag(b, off, 1, 'acceptTextures', (bb, o) => writeByte(bb, o, server.acceptTextures ? 1 : 0))
      // End of compound
      b.writeUInt8(0, off); off += 1
    }
    return off
  })

  // End of root compound
  buf.writeUInt8(0, offset); offset += 1

  return buf.subarray(0, offset)
}

/**
 * Write a servers.dat file with the CobbleClash server pre-added.
 */
export async function ensureServersDat(instanceDir: string): Promise<void> {
  const serversPath = join(instanceDir, 'servers.dat')
  // Only create if it doesn't exist (don't overwrite user's servers), but
  // repair the gzip-wrapped file written by 0.4.4, which Minecraft cannot read.
  if (await pathExists(serversPath)) {
    try {
      const head = (await readFile(serversPath)).subarray(0, 2)
      if (!(head[0] === 0x1f && head[1] === 0x8b)) return
      await rename(serversPath, `${serversPath}.gzip-backup-${Date.now()}`)
    } catch {
      return
    }
  }

  const data = encodeServersDat([
    { name: 'CobbleClash', ip: 'cobbleclash.kinetic.host', icon: '', acceptTextures: true }
  ])
  await writeFile(serversPath, data)
}
