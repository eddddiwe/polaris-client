import { describe, expect, it } from 'vitest'
import { beginRequest } from '../src/renderer/src/context'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('beginRequest', () => {
  it('invalidates every token once a newer request begins', () => {
    const sequence = { current: 0 }
    const first = beginRequest(sequence)
    expect(first()).toBe(true)

    const second = beginRequest(sequence)
    expect(first()).toBe(false)
    expect(second()).toBe(true)

    beginRequest(sequence)
    expect(second()).toBe(false)
  })

  it('drops an older reply that resolves after a newer one', async () => {
    const sequence = { current: 0 }
    const applied: string[] = []

    const refresh = async (label: string, delay: number): Promise<void> => {
      const isCurrent = beginRequest(sequence)
      await sleep(delay)
      if (isCurrent()) applied.push(label)
    }

    // The older snapshot was requested first but arrives last, as happens when
    // bootstrap's instance scan and update check take different amounts of time.
    await Promise.all([refresh('stale', 20), refresh('fresh', 0)])
    expect(applied).toEqual(['fresh'])
  })
})
