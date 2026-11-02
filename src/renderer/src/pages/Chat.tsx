import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { errorMessage, useApp } from '../context'
import { Icon } from '../components/Icons'
import { Spinner } from '../components/Feedback'
import { SkinAvatar } from '../components/SkinAvatar'
import type { ChatMessage, Friend } from '@shared/types'

type Connection = 'connecting' | 'connected' | 'disconnected'

const MAX_MESSAGE = 800
// Mirrors the Worker's history page size.
const HISTORY_PAGE = 40

function dayKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function dayLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (dayKey(timestamp) === dayKey(now.getTime())) return 'Today'
  if (dayKey(timestamp) === dayKey(yesterday.getTime())) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function clock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function shortStamp(timestamp: number): string {
  if (!timestamp) return ''
  if (dayKey(timestamp) === dayKey(Date.now())) return clock(timestamp)
  const date = new Date(timestamp)
  const now = new Date()
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' })
}

export function ChatPage(): JSX.Element {
  const { api, boot, toast, openAccount, navigate } = useApp()
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendsLoading, setFriendsLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({})
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [connection, setConnection] = useState<Connection>('disconnected')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [typing, setTyping] = useState<{ from: string; name: string } | null>(null)
  const [filter, setFilter] = useState('')

  const selectedRef = useRef<string | null>(null)
  const loadedRef = useRef<Set<string>>(new Set())
  const seenRef = useRef<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef(true)
  const typingTimer = useRef<number | null>(null)
  const lastTypingSent = useRef(0)
  const historySeq = useRef(0)
  const accountRef = useRef<string | null>(null)

  const active = boot.accounts.find((account) => account.id === boot.activeAccountId)
  const myCode = active?.friendCode ?? null
  const friendByCode = useMemo(() => {
    const map = new Map<string, Friend>()
    for (const friend of friends) map.set(friend.code, friend)
    return map
  }, [friends])

  const selectedFriend = selected ? friendByCode.get(selected) : undefined
  const messages = selected ? (threads[selected] ?? []) : []

  const appendMessage = useCallback((message: ChatMessage, mine: boolean) => {
    // The sender's own socket echoes their message back, so the id check has
    // to happen before any state change (including unread counts).
    if (seenRef.current.has(message.id)) return
    seenRef.current.add(message.id)
    const peer = mine ? message.to : message.from
    setThreads((current) => {
      const list = current[peer] ?? []
      return { ...current, [peer]: [...list, message].sort((a, b) => a.createdAt - b.createdAt) }
    })
    if (!mine && selectedRef.current !== peer) {
      setUnread((current) => ({ ...current, [peer]: (current[peer] ?? 0) + 1 }))
    }
  }, [])

  const loadHistory = useCallback(
    async (friendCode: string, force = false): Promise<void> => {
      if (!force && loadedRef.current.has(friendCode)) return
      const seq = ++historySeq.current
      setHistoryLoading(true)
      setHistoryError(null)
      try {
        const history = await api.chatHistory(friendCode)
        if (seq !== historySeq.current) return
        loadedRef.current.add(friendCode)
        for (const item of history) seenRef.current.add(item.id)
        setThreads((current) => {
          const existing = current[friendCode] ?? []
          const ids = new Set(history.map((item) => item.id))
          // Keep live messages that arrived while history was loading.
          const merged = [...history, ...existing.filter((item) => !ids.has(item.id))]
          merged.sort((a, b) => a.createdAt - b.createdAt)
          return { ...current, [friendCode]: merged }
        })
      } catch (error) {
        if (seq === historySeq.current) setHistoryError(errorMessage(error))
      } finally {
        if (seq === historySeq.current) setHistoryLoading(false)
      }
    },
    [api]
  )

  // Load the friend list for this account.
  useEffect(() => {
    let cancelled = false
    accountRef.current = myCode
    setFriends([])
    setThreads({})
    setUnread({})
    setHistoryError(null)
    setSelected(null)
    selectedRef.current = null
    loadedRef.current = new Set()
    seenRef.current = new Set()
    historySeq.current += 1
    if (!myCode) {
      setFriendsLoading(false)
      return
    }
    setFriendsLoading(true)
    void api
      .friendsList()
      .then((list) => {
        if (!cancelled) setFriends(list)
      })
      .catch((error) => {
        if (!cancelled) toast(errorMessage(error), 'error')
      })
      .finally(() => {
        if (!cancelled) setFriendsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, myCode, toast])

  // Connect while the Chat page is open; disconnect on leave.
  useEffect(() => {
    if (!myCode) return
    const offMessage = api.onChatMessage((message) => {
      appendMessage(message, message.from === myCode)
    })
    const offTyping = api.onChatTyping((update) => {
      if (!update?.from) return
      setTyping({ from: update.from, name: update.fromName || update.from })
      if (typingTimer.current) window.clearTimeout(typingTimer.current)
      typingTimer.current = window.setTimeout(() => setTyping(null), 3200)
    })
    const offState = api.onChatState((state) => {
      setConnection(state)
      if (state !== 'connected') return
      // Messages broadcast while the socket was down stay in KV. Reload the
      // open thread and let other threads refresh when they are next opened.
      loadedRef.current.clear()
      const openFriend = selectedRef.current
      if (openFriend) void loadHistory(openFriend, true)
    })
    void api.chatStart().catch((error) => {
      setConnection('disconnected')
      toast(errorMessage(error), 'error')
    })
    return () => {
      offMessage()
      offTyping()
      offState()
      if (typingTimer.current) window.clearTimeout(typingTimer.current)
      typingTimer.current = null
      void api.chatStop()
      setConnection('disconnected')
    }
  }, [api, myCode, appendMessage, loadHistory, toast])

  const chooseFriend = (friendCode: string): void => {
    if (selectedRef.current === friendCode) return
    selectedRef.current = friendCode
    setSelected(friendCode)
    setUnread((current) => {
      if (!current[friendCode]) return current
      const next = { ...current }
      delete next[friendCode]
      return next
    })
    setTyping(null)
    setHistoryError(null)
    // Never carry a half-written message into another friend's thread.
    setDraft('')
    lastTypingSent.current = 0
    stickRef.current = true
    void loadHistory(friendCode)
  }

  // Jump to the newest message when opening a thread or receiving while pinned.
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    if (!stickRef.current) return
    element.scrollTop = element.scrollHeight
  }, [messages.length, selected, typing, historyLoading])

  const onScroll = (): void => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    stickRef.current = distance < 90
  }

  const send = async (): Promise<void> => {
    const friendCode = selectedRef.current
    const snapshot = draft
    const text = snapshot.trim()
    if (!friendCode || !text || sending) return
    setSending(true)
    try {
      const message = await api.chatSend(friendCode, text)
      // Do not erase text typed while the request was in flight.
      setDraft((current) => (current === snapshot ? '' : current))
      lastTypingSent.current = 0
      stickRef.current = true
      appendMessage(message, true)
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setSending(false)
    }
  }

  const onDraftChange = (value: string): void => {
    setDraft(value.slice(0, MAX_MESSAGE))
    const friendCode = selectedRef.current
    if (!friendCode || !value.trim()) return
    const now = Date.now()
    if (now - lastTypingSent.current < 2500) return
    lastTypingSent.current = now
    void api.chatTyping(friendCode)
  }

  const orderedFriends = useMemo(() => {
    const lastAt = (code: string): number => {
      const list = threads[code]
      return list?.length ? list[list.length - 1].createdAt : 0
    }
    return [...friends].sort((a, b) => {
      const diff = lastAt(b.code) - lastAt(a.code)
      return diff !== 0 ? diff : a.name.localeCompare(b.name)
    })
  }, [friends, threads])

  const visibleFriends = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return orderedFriends
    return orderedFriends.filter(
      (friend) =>
        friend.name.toLowerCase().includes(query) || friend.code.toLowerCase().includes(query)
    )
  }, [filter, orderedFriends])

  const totalUnread = useMemo(
    () => Object.values(unread).reduce((sum, value) => sum + value, 0),
    [unread]
  )

  if (!active || !myCode) {
    return (
      <div className="chat-page">
        <div className="page-head">
          <div>
            <span className="eyebrow">Social</span>
            <h1>Chat</h1>
          </div>
        </div>
        <div className="empty-state">
          <Icon name="message" size={32} />
          <p>
            {!active
              ? 'Sign in with a Microsoft account to chat with your friends.'
              : active.type === 'offline'
                ? 'Chat needs a Microsoft account. Offline accounts can play, but cannot use chat.'
                : 'Your friend code is unavailable. Sign out and back in, then reopen Chat.'}
          </p>
          <button className="btn btn-primary" onClick={openAccount}>
            <Icon name="plus" size={14} /> {active ? 'Open accounts' : 'Add account'}
          </button>
        </div>
      </div>
    )
  }

  const typingInThread = typing && selected ? typing.from === selected : false

  return (
    <div className="chat-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Social</span>
          <h1>Chat</h1>
          <p className="page-sub">
            Private messages with your Polaris friends. Messages are stored for 30 days.
          </p>
        </div>
        <div className="chat-status-group">
          {connection === 'disconnected' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void api.chatStart().catch((error) => toast(errorMessage(error), 'error'))}
            >
              <Icon name="refresh" size={13} /> Reconnect
            </button>
          )}
          <span className={`chat-status chat-status-${connection}`}>
            <span className="chat-status-dot" />
            {connection === 'connected'
              ? 'Live'
              : connection === 'connecting'
                ? 'Connecting'
                : 'Offline'}
          </span>
        </div>
      </div>

      {friendsLoading ? (
        <div className="panel chat-panel">
          <Spinner label="Loading friends" />
        </div>
      ) : friends.length === 0 ? (
        <div className="empty-state">
          <Icon name="user" size={32} />
          <p>Add a friend first. Chat works with accepted friends only.</p>
          <button className="btn btn-primary" onClick={() => navigate('friends')}>
            <Icon name="plus" size={14} /> Add friends
          </button>
        </div>
      ) : (
        <div className="chat-panel">
          <aside className="chat-list" aria-label="Conversations">
            <div className="chat-list-head">
              <span className="eyebrow">Conversations</span>
              {totalUnread > 0 && <span className="chat-unread-total">{totalUnread}</span>}
            </div>
            <label className="chat-search">
              <Icon name="search" size={13} />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search friends"
                aria-label="Search friends"
              />
            </label>
            <div className="chat-list-rows">
              {visibleFriends.length === 0 ? (
                <p className="fine-print" style={{ padding: '10px 12px' }}>
                  No friends match that search.
                </p>
              ) : (
                visibleFriends.map((friend) => {
                  const list = threads[friend.code] ?? []
                  const last = list.length ? list[list.length - 1] : undefined
                  const count = unread[friend.code] ?? 0
                  const preview = last
                    ? `${last.from === myCode ? 'You: ' : ''}${last.text}`
                    : 'No messages yet'
                  return (
                    <button
                      key={friend.code}
                      type="button"
                      className={`chat-list-row${selected === friend.code ? ' active' : ''}`}
                      onClick={() => chooseFriend(friend.code)}
                    >
                      <SkinAvatar name={friend.name} uuid={friend.uuid} size={34} radius={10} />
                      <span className="chat-list-copy">
                        <span className="chat-list-name">
                          {friend.name}
                          {last && <span className="chat-list-time">{shortStamp(last.createdAt)}</span>}
                        </span>
                        <span className="chat-list-preview">{preview}</span>
                      </span>
                      {count > 0 && (
                        <span className="chat-unread" aria-label={`${count} unread`}>
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          <section className="chat-thread" aria-label={selectedFriend ? `Chat with ${selectedFriend.name}` : 'Chat'}>
            {!selected || !selectedFriend ? (
              <div className="chat-placeholder">
                <Icon name="message" size={30} />
                <h3>Pick a friend</h3>
                <p>Choose a conversation on the left to start chatting.</p>
              </div>
            ) : (
              <>
                <header className="chat-thread-head">
                  <SkinAvatar name={selectedFriend.name} uuid={selectedFriend.uuid} size={30} radius={9} />
                  <div className="chat-thread-who">
                    <strong>{selectedFriend.name}</strong>
                    <span className="friend-code-small">{selectedFriend.code}</span>
                  </div>
                  {connection !== 'connected' && (
                    <span className="chat-thread-note">
                      {connection === 'connecting' ? 'Connecting…' : 'Offline.'}
                    </span>
                  )}
                </header>

                <div
                  className="chat-messages"
                  ref={scrollRef}
                  onScroll={onScroll}
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions"
                >
                  {messages.length >= HISTORY_PAGE && (
                    <p className="chat-history-note">Older messages aren’t shown here.</p>
                  )}
                  {historyLoading && messages.length === 0 ? (
                    <Spinner label="Loading messages" />
                  ) : historyError && messages.length === 0 ? (
                    <div className="chat-inline-error">
                      <p>Could not load this conversation.</p>
                      <button
                        className="btn btn-soft btn-sm"
                        onClick={() => void loadHistory(selectedFriend.code, true)}
                      >
                        <Icon name="refresh" size={13} /> Retry
                      </button>
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="chat-empty-thread">
                      No messages yet. Say hello to {selectedFriend.name}.
                    </p>
                  ) : (
                    messages.map((message, index) => {
                      const mine = message.from === myCode
                      const previous = messages[index - 1]
                      const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt)
                      return (
                        <div key={message.id}>
                          {newDay && <div className="chat-day">{dayLabel(message.createdAt)}</div>}
                          <div className={`chat-bubble-row${mine ? ' mine' : ''}`}>
                            <div className={`chat-bubble${mine ? ' mine' : ''}`}>
                              <span className="chat-bubble-text">{message.text}</span>
                              <span className="chat-bubble-time">{clock(message.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  {typingInThread && (
                    <div className="chat-typing" aria-live="polite">
                      <span className="chat-typing-dots">
                        <i />
                        <i />
                        <i />
                      </span>
                      {typing?.name ?? selectedFriend.name} is typing
                    </div>
                  )}
                </div>

                <div className="chat-composer">
                  <textarea
                    value={draft}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter during IME composition belongs to the input method.
                      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        void send()
                      }
                    }}
                    placeholder={`Message ${selectedFriend.name}`}
                    aria-label={`Message ${selectedFriend.name}`}
                    rows={1}
                    maxLength={MAX_MESSAGE}
                  />
                  <button
                    className="btn btn-primary chat-send"
                    onClick={() => void send()}
                    disabled={sending || !draft.trim()}
                    aria-label="Send message"
                  >
                    {sending ? <span className="spinner spinner-sm" /> : <Icon name="arrowUp" size={16} />}
                  </button>
                </div>
                <div className="chat-composer-hint">
                  <span>Enter to send · Shift + Enter for a new line</span>
                  {draft.length > MAX_MESSAGE - 120 && (
                    <span>
                      {draft.length}/{MAX_MESSAGE}
                    </span>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
