/**
 * Friend mutations are account-scoped. A response that arrives after the user
 * switched accounts belongs to the old account and must not touch the page:
 * the remove IPC returns the old account's friend list, and applying it would
 * replace the new account's list.
 */
export async function settleForAccount<T>(
  pending: Promise<T>,
  startedFor: string | null,
  current: () => string | null
): Promise<T | null> {
  const result = await pending
  return startedFor !== null && startedFor === current() ? result : null
}
