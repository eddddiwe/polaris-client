import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { errorMessage, useApp } from '../context'
import { Icon } from '../components/Icons'
import { Modal, Spinner } from '../components/Feedback'
import { SkinAvatar } from '../components/SkinAvatar'
import { settleForAccount } from './friendsMutation'
import type { Friend } from '@shared/types'

type PresenceEntry = { server: string; lastSeen: number }
type PendingRequest = { code: string; name: string; uuid?: string; createdAt: number }
const EMPTY_PRESENCE: Record<string, PresenceEntry> = {}

// Flat JSON-safe payloads: serialized equality never hides a rendered change.
const samePayload = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
type BadgeProps = { server?: string; hasUuid: boolean; known: boolean }
const PresenceBadge = memo(function PresenceBadge({ server, hasUuid, known }: BadgeProps): JSX.Element {
  if (server !== undefined) return <span className="badge badge-online" title={`Seen on ${server}`}>Online</span>
  if (hasUuid && known) return <span className="badge badge-offline" title="No fresh presence record">No presence</span>
  return <span className="badge badge-warn" title="Presence could not be loaded">Unknown</span>
})
type FriendRowProps = { friend: Friend; server?: string; presenceKnown: boolean; removeDisabled: boolean; onRemove: (code: string, name: string) => void }
const FriendRow = memo(function FriendRow({ friend, server, presenceKnown, removeDisabled, onRemove }: FriendRowProps): JSX.Element {
  return (
    <div className="friend-row">
      <div className="friend-avatar"><SkinAvatar name={friend.name} uuid={friend.uuid} size={36} radius={10} /></div>
      <div className="friend-info">
        <strong>{friend.name}</strong>
        {friend.code && <span className="friend-code-small muted">({friend.code})</span>}
        {server !== undefined && <span className="friend-server">Playing on {server}</span>}
      </div>
      <PresenceBadge server={server} hasUuid={Boolean(friend.uuid)} known={presenceKnown} />
      <button className="icon-btn" aria-label={`Remove ${friend.name}`} disabled={removeDisabled} onClick={() => onRemove(friend.code, friend.name)}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  )
})
type RequestRowProps = { request: PendingRequest; onRespond: (code: string, action: 'accept' | 'decline') => void }
const RequestRow = memo(function RequestRow({ request, onRespond }: RequestRowProps): JSX.Element {
  return (
    <div className="friend-row" style={{ borderColor: 'var(--accent-2)' }}>
      <div className="friend-avatar"><SkinAvatar name={request.name} uuid={request.uuid} size={36} radius={10} /></div>
      <div className="friend-info">
        <strong>{request.name}</strong>
        <span className="friend-code-small">{request.code}</span>
      </div>
      <span className="badge badge-violet">Pending</span>
      <div className="icon-btn-group">
        <button className="icon-btn" aria-label={`Accept ${request.name}`} onClick={() => onRespond(request.code, 'accept')}>
          <Icon name="check" size={12} />
        </button>
        <button className="icon-btn" aria-label={`Decline ${request.name}`} onClick={() => onRespond(request.code, 'decline')}>
          <Icon name="x" size={12} />
        </button>
      </div>
    </div>
  )
})

export function FriendsPage(): JSX.Element {
  const { api, boot, toast, openAccount, confirm } = useApp()
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [presence, setPresence] = useState<Record<string, PresenceEntry>>(EMPTY_PRESENCE)
  const [presenceKnown, setPresenceKnown] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const pollBusy = useRef(false)
  const refreshSeq = useRef(0)
  const requestsSeq = useRef(0)

  const active = boot.accounts.find((account) => account.id === boot.activeAccountId)
  const myCode = active?.friendCode ?? null
  const accountRef = useRef(myCode)
  // Keep ownership accurate from commit, before a late mutation can resolve.
  useLayoutEffect(() => {
    accountRef.current = myCode
  }, [myCode])

  const refresh = useCallback(async (silent = false): Promise<void> => {
    const seq = ++refreshSeq.current
    try {
      const list = await api.friendsList()
      if (seq !== refreshSeq.current) return
      setFriends((current) => (samePayload(current, list) ? current : list))
      const uuids = list.map((friend) => friend.uuid).filter((uuid): uuid is string => Boolean(uuid))
      if (!uuids.length) {
        setPresence(EMPTY_PRESENCE)
        setPresenceKnown(true)
        return
      }
      const next = await api.friendsPresence(uuids)
      if (seq !== refreshSeq.current) return
      const nextPresence = next ?? EMPTY_PRESENCE
      setPresence((current) => (samePayload(current, nextPresence) ? current : nextPresence))
      setPresenceKnown(next !== null)
    } catch (error) {
      if (seq !== refreshSeq.current) return
      setPresence(EMPTY_PRESENCE)
      setPresenceKnown(false)
      if (!silent) toast(errorMessage(error), 'error')
    } finally {
      // A silent poll can be the request that settles the initial spinner.
      if (seq === refreshSeq.current) setLoading(false)
    }
  }, [api, toast])

  const loadRequests = useCallback(async (silent = false): Promise<void> => {
    if (!myCode) {
      setPendingRequests([])
      return
    }
    const seq = ++requestsSeq.current
    if (!silent) setRequestsLoading(true)
    try {
      const requests = await api.friendsGetRequests()
      if (seq !== requestsSeq.current) return
      setPendingRequests((current) => (samePayload(current, requests) ? current : requests))
    } catch {
      if (seq !== requestsSeq.current) return
      if (!silent) setPendingRequests([])
    } finally {
      if (seq === requestsSeq.current) setRequestsLoading(false)
    }
  }, [api, myCode])

  useEffect(() => {
    // The page stays mounted across account switches. Invalidate in-flight
    // responses, then clear so one account never shows another account's
    // friend list while the API loads.
    refreshSeq.current += 1
    requestsSeq.current += 1
    setFriends([])
    setPendingRequests([])
    setPresence(EMPTY_PRESENCE)
    setPresenceKnown(false)
    setRemoving(null)
    if (!myCode) {
      setLoading(false)
      setRequestsLoading(false)
      return
    }
    setLoading(true)
    void refresh()
    void loadRequests()
  }, [api, loadRequests, myCode, refresh])

  // Keep the Friends tab live: poll requests and the friend list, and refresh
  // immediately when the window regains focus.
  useEffect(() => {
    const poll = (): void => {
      if (!myCode || document.visibilityState !== 'visible' || pollBusy.current) return
      pollBusy.current = true
      void Promise.all([refresh(true), loadRequests(true)]).finally(() => {
        pollBusy.current = false
      })
    }
    const timer = window.setInterval(poll, 15000)
    const onFocus = (): void => poll()
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') poll()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [api, loadRequests, myCode, refresh])

  const copyCode = async (): Promise<void> => {
    if (!myCode) return
    try {
      await navigator.clipboard.writeText(myCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast('Could not copy to clipboard', 'error')
    }
  }

  const sendRequest = async (): Promise<void> => {
    const c = code.trim().toUpperCase()
    if (!c) {
      toast('Enter a friend code', 'error')
      return
    }
    setBusy(true)
    const accountAtSend = myCode
    try {
      const sent = await settleForAccount(api.friendsRequest(c), accountAtSend, () => accountRef.current)
      if (!sent) return
      setCode('')
      setAddOpen(false)
      toast('Friend request sent', 'success')
      void loadRequests()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const respondRequest = async (friendCode: string, action: 'accept' | 'decline'): Promise<void> => {
    if (!myCode) return
    try {
      const handled = await settleForAccount(
        api.friendsRespond(friendCode, action),
        myCode,
        () => accountRef.current
      )
      if (!handled) return
      await refresh()
      void loadRequests()
      const actionText = action === 'accept' ? 'accepted' : 'declined'
      toast(`Friend request ${actionText}`, 'info')
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  const removeFriend = async (friendCode: string, name: string): Promise<void> => {
    if (!friendCode || removing) return
    const accountAtConfirm = accountRef.current
    setRemoving(friendCode)
    try {
      const confirmed = await confirm({
        title: 'Remove friend?',
        message: `This removes ${name} from your list. Polaris also asks the server to remove you from theirs. If you're offline, this only removes them on this device and they may come back when you reconnect.`,
        confirmLabel: 'Remove friend',
        danger: true
      })
      if (!confirmed || accountRef.current !== accountAtConfirm) return
      try {
        const result = await settleForAccount(
          api.friendsRemoveMutual(friendCode),
          accountAtConfirm,
          () => accountRef.current
        )
        if (!result) return
        // A poll that started before the removal must not put the friend back.
        refreshSeq.current += 1
        setFriends(result.friends)
        if (result.synced) {
          toast('Friend removed', 'success')
          void refresh(true)
        } else {
          toast('Removed on this device. They may return when you reconnect.', 'info')
        }
      } catch (error) {
        toast(errorMessage(error), 'error')
      }
    } finally {
      setRemoving((current) => (current === friendCode ? null : current))
    }
  }

  // Latest handlers behind stable callbacks keep memoized row props unchanged.
  const handlers = useRef({ remove: removeFriend, respond: respondRequest })
  useEffect(() => {
    handlers.current = { remove: removeFriend, respond: respondRequest }
  })
  const handleRemove = useCallback((code: string, name: string) => void handlers.current.remove(code, name), [])
  const handleRespond = useCallback((code: string, action: 'accept' | 'decline') => void handlers.current.respond(code, action), [])

  if (!active || !myCode) {
    return (
      <div className="friends-page">
        <div className="page-head">
          <div>
            <span className="eyebrow">Social</span>
            <h1>Friends</h1>
          </div>
        </div>
        <div className="empty-state">
          <Icon name="user" size={32} />
          <p>
            {!active
              ? 'Sign in with a Microsoft account to get your friend code and add friends.'
              : active.type === 'offline'
                ? 'Friend codes and requests need a Microsoft account. Offline accounts can play, but cannot use Friends.'
                : 'Your friend code is unavailable. Sign out and back in, then reopen Friends.'}
          </p>
          <button className="btn btn-primary" onClick={openAccount}>
            <Icon name="plus" size={14} /> {active ? 'Open accounts' : 'Add account'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="friends-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Social</span>
          <h1>Friends</h1>
          <p className="page-sub">Add friends by their Polaris friend code. Online status comes from presence sharing, which is off by default.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={14} /> Add friend
        </button>
      </div>

      <section className="panel friend-code-card">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Your code</span>
            <h2>Share this with friends</h2>
          </div>
        </div>
        <div className="friend-code-row">
          <code className="friend-code">{myCode}</code>
          <button className="btn btn-soft btn-sm" onClick={() => void copyCode()}>
            {copied ? <Icon name="check" size={14} /> : null} {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="fine-print">Friends add you using this code. Codes are unique to your account.</p>
      </section>

      <section className="panel" style={{ marginTop: '12px' }}>
        <div className="panel-head">
          <div>
            <span className="eyebrow">Pending requests</span>
            <h2>Friend requests</h2>
          </div>
          <span className="badge badge-violet">Live</span>
        </div>
        {requestsLoading ? (
          <Spinner label="Loading requests" />
        ) : pendingRequests.length === 0 ? (
          <p className="fine-print">No pending friend requests.</p>
        ) : (
          <div>
            {pendingRequests.map((req) => (
              <RequestRow key={req.code} request={req} onRespond={handleRespond} />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Your friends</span>
            <h2>{friends.length} friend{friends.length === 1 ? '' : 's'}</h2>
          </div>
        </div>
        {loading ? (
          <Spinner label="Loading friends" />
        ) : friends.length === 0 ? (
          <p className="empty-line">No friends yet. Share your code to get started.</p>
        ) : (
          <div className="friends-list">
            {friends.map((friend) => (
              <FriendRow
                key={friend.code}
                friend={friend}
                server={friend.uuid ? presence[friend.uuid.toLowerCase()]?.server : undefined}
                presenceKnown={presenceKnown}
                removeDisabled={removing !== null}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </section>

      {addOpen && (
        <Modal title="Add friend" eyebrow="Social" onClose={() => setAddOpen(false)} width={420}>
          <div className="field">
            <label htmlFor="friend-code">Friend code</label>
            <input
              id="friend-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="POLARIS-XXXX-XXXX"
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void sendRequest()} disabled={busy || !code.trim()}>
              {busy ? <span className="spinner spinner-sm" /> : <Icon name="plus" size={14} />} Send request
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}