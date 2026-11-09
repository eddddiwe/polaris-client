/**
 * A chat send response is account-scoped. The page clears threads, unread and
 * seen IDs when the active account changes, but the HTTP request already in
 * flight still resolves with the previous account's message. Appending that
 * message would leak the old account's conversation into the new account.
 *
 * The account can legitimately switch away and back while the request is in
 * flight; the message still belongs to the current account then, so the check
 * compares the message sender with the account active at resolution time.
 */
export async function settleChatSend<T extends { from: string }>(
  pending: Promise<T>,
  currentAccount: () => string | null
): Promise<T | null> {
  const message = await pending
  return message.from === currentAccount() ? message : null
}
