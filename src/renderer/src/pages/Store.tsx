import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { CosmeticItem, CosmeticSnapshot } from '@shared/types'
import { errorMessage, formatPlaytime, useApp } from '../context'
import { Icon } from '../components/Icons'
import { CapeArt, CosmeticBadge } from '../components/Cosmetics'
import { SkinAvatar } from '../components/SkinAvatar'
import { EmptyState, Spinner } from '../components/Feedback'

type Filter = 'all' | 'badge' | 'cape'

/** Memoized row: only rows whose owned/equipped/affordability state changed re-render after an action. */
const CosmeticCard = memo(function CosmeticCard({
  item,
  owned,
  equipped,
  affordable,
  hint,
  busy,
  disabled,
  onEquip,
  onUnlock
}: {
  item: CosmeticItem
  owned: boolean
  equipped: boolean
  affordable: boolean
  hint?: string
  busy: boolean
  disabled: boolean
  onEquip: (item: CosmeticItem) => void
  onUnlock: (item: CosmeticItem) => void
}): JSX.Element {
  const style = { '--c1': item.colors[0], '--c2': item.colors[1] } as CSSProperties
  return (
    <article className={`cosmetic-card rarity-${item.rarity} ${equipped ? 'equipped' : ''}`} style={style}>
      <div className={`cosmetic-art ${item.kind === 'cape' ? 'cape' : 'badge'}`}>
        <span className="cosmetic-glow" />
        {item.kind === 'badge' ? <CosmeticBadge id={item.id} size={68} /> : <CapeArt item={item} />}
      </div>
      <div className="cosmetic-copy">
        <div className="cosmetic-title-row">
          <strong>{item.name}</strong>
          <span className={`rarity rarity-${item.rarity}`}>{item.rarity}</span>
        </div>
        <p>{item.tagline}</p>
        <div className="cosmetic-footer">
          <span className="cosmetic-kind">
            <Icon name={item.kind === 'badge' ? 'star' : 'shield'} size={12} />
            {item.kind === 'badge' ? 'Profile badge' : 'Cape'}
          </span>
          {owned ? (
            equipped ? (
              <span className="cosmetic-equipped">
                <Icon name="check" size={13} /> Equipped
              </span>
            ) : (
              <button className="btn btn-soft btn-sm" disabled={disabled || busy} onClick={() => void onEquip(item)}>
                {busy ? <span className="spinner spinner-sm" /> : 'Equip'}
              </button>
            )
          ) : (
            <button
              className="btn btn-primary btn-sm"
              disabled={disabled || busy || !affordable}
              title={hint}
              onClick={() => void onUnlock(item)}
            >
              {busy ? (
                <span className="spinner spinner-sm" />
              ) : (
                <>
                  <Icon name="gem" size={13} /> {item.price}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </article>
  )
})

/** Claim spinner state stays local to the preview; the catalog grid is untouched. */
const ClaimButton = memo(function ClaimButton({
  claimable,
  disabled,
  onClaim
}: {
  claimable: number
  disabled: boolean
  onClaim: () => Promise<void>
}): JSX.Element {
  const [claiming, setClaiming] = useState(false)
  const claim = async (): Promise<void> => {
    setClaiming(true)
    await onClaim().finally(() => setClaiming(false))
  }
  return (
    <button className="btn btn-primary btn-sm" onClick={() => void claim()} disabled={disabled || claiming || claimable <= 0}>
      {claiming ? <span className="spinner spinner-sm" /> : <Icon name="gem" size={14} />}
      {claimable > 0 ? `Claim ${claimable} shards` : 'No shards to claim'}
    </button>
  )
})

export function StorePage(): JSX.Element {
  const { api, boot, refresh, toast, openAccount } = useApp()
  const [snapshot, setSnapshot] = useState<CosmeticSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const loadSeq = useRef(0)
  const active = boot.accounts.find((account) => account.id === boot.activeAccountId)
  const accountRef = useRef(boot.activeAccountId)

  const load = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    setLoadError(null)
    try {
      const value = await api.cosmetics()
      if (seq === loadSeq.current) setSnapshot(value)
    } catch (error) {
      if (seq !== loadSeq.current) return
      // A toast disappears; without inline state the page would spin forever.
      setLoadError(errorMessage(error))
      toast(errorMessage(error), 'error')
    }
  }, [api, toast])

  useLayoutEffect(() => {
    // Never show the previous account's shard balance or owned cosmetics, and
    // invalidate reads that were already in flight.
    accountRef.current = boot.activeAccountId
    loadSeq.current += 1
    setSnapshot(null)
    setLoadError(null)
  }, [boot.activeAccountId])

  useEffect(() => {
    void load()
    return () => {
      loadSeq.current += 1
    }
  }, [load, boot.activeAccountId])

  useEffect(() => {
    return api.onShardsChanged(() => {
      const seq = ++loadSeq.current
      void api
        .cosmetics()
        .then((next) => {
          if (seq === loadSeq.current) setSnapshot(next)
        })
        .catch((error) => toast(errorMessage(error), 'error'))
    })
  }, [api, toast])

  const unlock = useCallback(
    async (item: CosmeticItem): Promise<void> => {
      const accountAtStart = accountRef.current
      setBusy(item.id)
      try {
        const next = await api.buyCosmetic(item.id)
        if (accountRef.current !== accountAtStart) return
        setSnapshot(next)
        await refresh()
        toast(`${item.name} unlocked`, 'success')
      } catch (error) {
        toast(errorMessage(error), 'error')
      } finally {
        setBusy(null)
      }
    },
    [api, refresh, toast]
  )

  const equip = useCallback(
    async (item: CosmeticItem): Promise<void> => {
      const accountAtStart = accountRef.current
      setBusy(item.id)
      try {
        const next = await api.equipCosmetic(item.id)
        if (accountRef.current !== accountAtStart) return
        setSnapshot(next)
        await refresh()
        toast(`${item.name} equipped`, 'success')
      } catch (error) {
        toast(errorMessage(error), 'error')
      } finally {
        setBusy(null)
      }
    },
    [api, refresh, toast]
  )

  const claim = useCallback(async (): Promise<void> => {
    const accountAtStart = accountRef.current
    try {
      const result = await api.claimShards()
      if (accountRef.current !== accountAtStart) return
      setSnapshot(result.snapshot)
      await refresh()
      toast(
        result.granted > 0 ? `Claimed ${result.granted} shards` : 'No new playtime to convert',
        result.granted > 0 ? 'success' : 'info'
      )
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }, [api, refresh, toast])

  if (!snapshot) {
    return (
      <div className="store-page">
        <div className="page-head">
          <div>
            <span className="eyebrow">Polaris studio</span>
            <h1>Cosmetics</h1>
          </div>
        </div>
        {loadError ? (
          <EmptyState
            icon="info"
            title="Could not open the wardrobe"
            body={loadError}
            action={
              <button className="btn btn-primary" onClick={() => void load()}>
                Try again
              </button>
            }
          />
        ) : (
          <Spinner label="Opening the wardrobe" />
        )}
      </div>
    )
  }

  const items = snapshot.items.filter((item) => filter === 'all' || item.kind === filter)
  const equippedBadge = snapshot.items.find((item) => item.id === snapshot.equippedBadge)
  const equippedCape = snapshot.items.find((item) => item.id === snapshot.equippedCape)

  return (
    <div className="store-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Polaris studio</span>
          <h1>Wear your orbit.</h1>
          <p className="page-sub">
            Profile badges and capes for the launcher. Every badge appears beside your name, so the client knows its own.
          </p>
        </div>
        <div className="shard-balance" title="Earned from playtime and adjustments">
          <Icon name="gem" size={16} />
          <strong aria-live="polite">{snapshot.shards.toLocaleString()}</strong>
          <span>shards</span>
        </div>
      </div>

      <section className="store-profile panel">
        <div className="store-profile-main">
          <span className="store-avatar">
            <SkinAvatar skinUrl={active?.skinUrl} name={active?.name ?? '?'} uuid={active?.uuid} size={54} radius={14} />
            <span className="store-avatar-badge">
              <CosmeticBadge id={snapshot.equippedBadge} size={20} />
            </span>
          </span>
          <div className="store-profile-copy">
            <span className="eyebrow">Your profile</span>
            <strong className="store-name">
              {active ? active.name : 'No account yet'}
              {active && <CosmeticBadge id={snapshot.equippedBadge} size={18} />}
            </strong>
            <span>
              {active
                ? `${equippedBadge?.name ?? 'North Star'} badge · ${equippedCape?.name ?? 'Midnight'} cape`
                : 'Add an account to give your profile a name.'}
            </span>
          </div>
        </div>
        <div className="store-profile-equip">
          <div className="store-equipped">
            <span className="store-equipped-art">
              {equippedCape && <CapeArt item={equippedCape} />}
            </span>
            <div>
              <span className="eyebrow">Equipped cape</span>
              <strong>{equippedCape?.name ?? 'Midnight'}</strong>
            </div>
          </div>
          <ClaimButton claimable={snapshot.claimable} disabled={busy !== null} onClaim={claim} />
        </div>
        <div className="store-earn">
          <span>
            <Icon name="clock" size={14} /> {formatPlaytime(snapshot.totalPlaytimeMs)} tracked · 40 shards per hour
          </span>
          {!active && (
            <button className="link" onClick={openAccount}>
              Add account <Icon name="chevron" size={12} />
            </button>
          )}
        </div>
      </section>

      <div className="store-toolbar">
        <div className="segmented">
          {(
            [
              ['all', `All ${snapshot.items.length}`],
              ['badge', `Badges ${snapshot.items.filter((item) => item.kind === 'badge').length}`],
              ['cape', `Capes ${snapshot.items.filter((item) => item.kind === 'cape').length}`]
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <span className="panel-hint">Unlocks are stored locally · no real-money purchases</span>
      </div>

      <div className="cosmetic-grid" aria-busy={busy !== null}>
        {items.map((item) => {
          const affordable = snapshot.shards >= item.price
          return (
            <CosmeticCard
              key={item.id}
              item={item}
              owned={snapshot.owned.includes(item.id)}
              equipped={
                item.kind === 'badge' ? snapshot.equippedBadge === item.id : snapshot.equippedCape === item.id
              }
              affordable={affordable}
              hint={affordable ? undefined : `Earn ${item.price - snapshot.shards} more shards by playing`}
              busy={busy === item.id}
              disabled={busy !== null}
              onEquip={equip}
              onUnlock={unlock}
            />
          )
        })}
      </div>

      <section className="store-notes">
        <div className="store-note">
          <span className="store-note-icon">
            <Icon name="shield" size={18} />
          </span>
          <div>
            <strong>Local first</strong>
            <p>Owned cosmetics and equipped items live in your Polaris settings. Nothing is uploaded, and no payment is involved.</p>
          </div>
        </div>
        <div className="store-note">
          <span className="store-note-icon">
            <Icon name="clock" size={18} />
          </span>
          <div>
            <strong>Play to earn</strong>
            <p>Every tracked hour adds 40 shards. Claim them here whenever you like — the counter remembers what it already paid out.</p>
          </div>
        </div>
        <div className="store-note">
          <span className="store-note-icon">
            <Icon name="gamepad" size={18} />
          </span>
          <div>
            <strong>In-game next</strong>
            <p>Badges show beside your name in the launcher today. In-game nametags and capes need a companion/server relay, which is not part of this build.</p>
          </div>
        </div>

        <div className="store-note">
          <span className="store-note-icon">
            <Icon name="heart" size={18} />
          </span>
          <div>
            <strong>Support the project</strong>
            <p>
              If you enjoy Polaris, you can <a href="https://paypal.me/ledrinkossoss" target="_blank" rel="noopener">support development via PayPal</a>. Donations help fund servers, features, and continued development. No purchase is required to enjoy all cosmetics — they are earned through playtime.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
