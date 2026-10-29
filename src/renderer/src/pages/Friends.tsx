import { useEffect, useState, type CSSProperties } from 'react'
import { errorMessage, useApp } from '../context'
import { Icon } from '../components/Icons'
import { Modal, Spinner } from '../components/Feedback'
import { SkinAvatar } from '../components/SkinAvatar'
import type { Friend } from '@shared/types'

export function FriendsPage(): JSX.Element {
  const { api, boot, toast, openAccount } = useApp()
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const active = boot.accounts.find((account) => account.id === boot.activeAccountId)
  const myCode = active?.friendCode ?? null

  const refresh = async (): Promise<void> => {
    try {
      const list = await api.friendsList()
      setFriends(list)
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [api])

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

  const add = async (): Promise<void> => {
    const c = code.trim().toUpperCase()
    if (!c) {
      toast('Enter a friend code', 'error')
      return
    }
    setBusy(true)
    try {
      const list = await api.friendsAdd(c, name.trim())
      setFriends(list)
      setCode('')
      setName('')
      setAddOpen(false)
      toast('Friend added', 'success')
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (friendCode: string): Promise<void> => {
    try {
      const list = await api.friendsRemove(friendCode)
      setFriends(list)
      toast('Friend removed', 'info')
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }

  if (!active) {
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
          <p>Sign in to get your friend code and add friends.</p>
          <button className="btn btn-primary" onClick={openAccount}>
            <Icon name="plus" size={14} /> Add account
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
          <p className="page-sub">Add friends by their Polaris friend code. Presence requires the backend to be deployed.</p>
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
              <div key={friend.code} className="friend-row">
                <div className="friend-avatar">
                  <SkinAvatar name={friend.name} size={36} radius={10} />
                </div>
                <div className="friend-info">
                  <strong>{friend.name}</strong>
                  <span className="friend-code-small">{friend.code}</span>
                </div>
                <span className="badge badge-violet">Offline</span>
                <button className="icon-btn" aria-label={`Remove ${friend.name}`} onClick={() => void remove(friend.code)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
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
          <div className="field">
            <label htmlFor="friend-name">Name (optional)</label>
            <input
              id="friend-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their name"
            />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void add()} disabled={busy || !code.trim()}>
              {busy ? <span className="spinner spinner-sm" /> : <Icon name="plus" size={14} />} Add
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}