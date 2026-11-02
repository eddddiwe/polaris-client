import { useEffect, useRef, useState } from 'react'
import { errorMessage, useApp } from '../context'
import { Icon } from '../components/Icons'
import { Modal, Spinner } from '../components/Feedback'
import { SkinAvatar } from '../components/SkinAvatar'
import type { Friend } from '@shared/types'

export function FriendsPage(): JSX.Element {
  const { api, boot, toast, openAccount, confirm } = useApp()
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pendingRequests, setPendingRequests] = useState<Array<{ code: string; name: string; uuid?: string; createdAt: number }>>([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [presence, setPresence] = useState<Record<string, { server: string; lastSeen: number }>>({})
  const [presenceKnown, setPresenceKnown] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const pollBusy = useRef(false)
  const refreshSeq = useRef(0)
  const requestsSeq = useRef(0)

  const active = boot.accounts.find((account) => account.id === boot.activeAccountId)
  const myCode = active?.friendCode ?? null
  const accountRef = useRef(myCode)

  const refresh = async (silent = false): Promise<void> => {
    const seq = ++refreshSeq.current
    try {
      const list = await api.friendsList()
      if (seq !== refreshSeq.current) return
      setFriends(list)
      const uuids = list.map((friend) => friend.uuid).filter((uuid): uuid is string => Boolean(uuid))
      if (!uuids.length) {
        setPresence({})
        setPresenceKnown(true)
        return
      }
      const next = await api.friendsPresence(uuids)
      if (seq !== refreshSeq.current) return
      setPresence(next ?? {})
      setPresenceKnown(next !== null)
    } catch (error) {
      if (seq !== refreshSeq.current) return
      setPresence({})
      setPresenceKnown(false)
      if (!silent) toast(errorMessage(error), 'error')
    } finally {
      // A silent poll can be the request that settles the initial spinner.
      if (seq === refreshSeq.current) setLoading(false)
    }
  }

  const loadRequests = async (silent = false): Promise<void> => {
    if (!myCode) {
      setPendingRequests([])
      return
    }
    const seq = ++requestsSeq.current
    if (!silent) setRequestsLoading(true)
    try {
      const requests = await api.friendsGetRequests()
      if (seq !== requestsSeq.current) return
      setPendingRequests(requests)
    } catch {
      if (seq !== requestsSeq.current) return
      if (!silent) setPendingRequests([])
    } finally {
      if (seq === requestsSeq.current) setRequestsLoading(false)
    }
  }

  useEffect(() => {
    // The page stays mounted across account switches. Invalidate in-flight
    // responses, then clear so one account never shows another account's
    // friend list while the API loads.
    accountRef.current = myCode
    refreshSeq.current += 1
    requestsSeq.current += 1
    setFriends([])
    setPendingRequests([])
    setPresence({})
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
  }, [api, myCode])

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
  }, [api, myCode])

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
    try {
      await api.friendsRequest(c)
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
      await api.friendsRespond(friendCode, action)
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
        const result = await api.friendsRemoveMutual(friendCode)
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
              <div key={req.code} className="friend-row" style={{ borderColor: 'var(--accent-2)' }}>
                <div className="friend-avatar">
                  <SkinAvatar name={req.name} uuid={req.uuid} size={36} radius={10} />
                </div>
                <div className="friend-info">
                  <strong>{req.name}</strong>
                  <span className="friend-code-small">{req.code}</span>
                </div>
                <span className="badge badge-violet">Pending</span>
                <div className="icon-btn-group">
                  <button className="icon-btn" aria-label={`Accept ${req.name}`} onClick={() => void respondRequest(req.code, 'accept')}>
                    <Icon name="check" size={12} />
                  </button>
                  <button className="icon-btn" aria-label={`Decline ${req.name}`} onClick={() => void respondRequest(req.code, 'decline')}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              </div>
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
            {friends.map((friend) => {
              const friendPresence = friend.uuid
                ? presence[friend.uuid.toLowerCase()]
                : undefined
              return (
                <div key={friend.code} className="friend-row">
                  <div className="friend-avatar">
                    <SkinAvatar name={friend.name} uuid={friend.uuid} size={36} radius={10} />
                  </div>
                  <div className="friend-info">
                    <strong>{friend.name}</strong>
                    {friend.code && (
                      <span className="friend-code-small muted">({friend.code})</span>
                    )}
                    {friendPresence && (
                      <span className="friend-server">
                        Playing on {friendPresence.server}
                      </span>
                    )}
                  </div>
                  {friendPresence ? (
                    <span className="badge badge-online" title={`Seen on ${friendPresence.server}`}>
                      Online
                    </span>
                  ) : friend.uuid && presenceKnown ? (
                    <span className="badge badge-offline" title="No fresh presence record">
                      No presence
                    </span>
                  ) : (
                    <span className="badge badge-warn" title="Presence could not be loaded">
                      Unknown
                    </span>
                  )}
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${friend.name}`}
                    disabled={removing !== null}
                    onClick={() => void removeFriend(friend.code, friend.name)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              )
            })}
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