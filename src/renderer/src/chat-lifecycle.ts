/**
 * The chat IPC handler registers the friend account before it opens a socket.
 * A stop issued while that start is still in flight can therefore be overtaken:
 * the handler resumes afterwards and starts a socket nobody is listening to.
 *
 * Re-issue the stop once the start settles, unless a newer effect (account
 * switch or remount) already owns the chat connection.
 */
export function stopChatAfterStart(
  start: Promise<unknown>,
  isCurrent: () => boolean,
  stop: () => void
): void {
  void start
    .catch(() => undefined)
    .then(() => {
      if (isCurrent()) stop()
    })
}
