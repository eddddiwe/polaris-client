import { describe, expect, it } from 'vitest'
import { canLaunchFromHome } from '../src/renderer/src/pages/homeLaunch'

describe('canLaunchFromHome', () => {
  it('allows a launch when nothing is running and nothing is preparing', () => {
    expect(canLaunchFromHome(false, 'idle')).toBe(true)
    expect(canLaunchFromHome(false, 'exited')).toBe(true)
    expect(canLaunchFromHome(false, 'crashed')).toBe(true)
  })

  it('blocks a second launch while one is preparing', () => {
    // Regression: Home's Recent-instance buttons stayed enabled here, and the
    // launcher's child process does not exist yet, so it accepted a parallel
    // launch (second install/JVM).
    expect(canLaunchFromHome(false, 'preparing')).toBe(false)
  })

  it('blocks a launch while a game or server is running', () => {
    expect(canLaunchFromHome(true, 'running')).toBe(false)
    expect(canLaunchFromHome(true, 'idle')).toBe(false)
  })
})
