import { useEffect, useState } from 'react'
import type { DeviceCodeInfo, InstanceKind, LoaderType, PerfProfileId, VersionSummary } from '@shared/types'
import { errorMessage, useApp, type ConfirmOptions } from '../context'
import { Icon } from './Icons'
import { CosmeticBadge } from './Cosmetics'
import { Modal, Spinner } from './Feedback'

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onCancel,
  onConfirm
}: ConfirmOptions & { onCancel: () => void; onConfirm: () => void }): JSX.Element {
  return (
    <Modal title={title} eyebrow="Please confirm" onClose={onCancel} width={440}>
      {message && <p className="confirm-copy">{message}</p>}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function NewInstanceModal({
  onClose,
  onCreated
}: {
  onClose: () => void
  onCreated: (id: string) => void
}): JSX.Element {
  const { api, settings, hardware, boot, toast, refresh } = useApp()
  const [kind, setKind] = useState<InstanceKind>('game')
  const [name, setName] = useState('New instance')
  const [versions, setVersions] = useState<VersionSummary[]>([])
  const [mcVersion, setMcVersion] = useState(boot.latestVersion ?? '')
  const [loader, setLoader] = useState<LoaderType>('fabric')
  const [profile, setProfile] = useState<PerfProfileId>('balanced')
  const [memory, setMemory] = useState(hardware.recommendedMemoryMb)
  const [packs, setPacks] = useState<string[]>(['performance', 'qol'])
  const [port, setPort] = useState(25565)
  const [eula, setEula] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .versions(settings.showSnapshots)
      .then((list) => {
        setVersions(list)
        setMcVersion((current) => current || list[0]?.id || '')
      })
      .catch((err) => setError(errorMessage(err)))
  }, [api, settings.showSnapshots])

  const create = async (): Promise<void> => {
    if (!mcVersion) return
    setBusy(true)
    setError('')
    try {
      const created = await api.createInstance({
        name: name.trim() || (kind === 'server' ? 'New server' : 'New instance'),
        mcVersion,
        loader,
        kind,
        memoryMb: memory,
        perfProfile: profile,
        packs: loader === 'fabric' ? packs : [],
        port: kind === 'server' ? port : undefined,
        eulaAccepted: kind === 'server' ? eula : undefined
      })
      let installed = 0
      for (const packId of loader === 'fabric' ? packs : []) {
        try {
          const result = await api.applyPack(created.id, packId)
          installed += result.result.installed.length
          const failed = result.result.failed[0]
          if (failed) toast(`${failed.name}: ${failed.error}`, 'error')
        } catch (packError) {
          toast(`Pack ${packId}: ${errorMessage(packError)}`, 'error')
        }
      }
      await refresh()
      onCreated(created.id)
      toast(
        installed
          ? `${created.name} is ready with ${installed} mods`
          : `${created.name} is ready${kind === 'server' && !eula ? ' — accept the EULA before starting' : ''}`,
        'success'
      )
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const chooseKind = (next: InstanceKind): void => {
    setKind(next)
    setPacks(next === 'server' ? ['server'] : ['performance', 'qol'])
    if (name === 'New instance' || name === 'New server') {
      setName(next === 'server' ? 'New server' : 'New instance')
    }
  }

  const availablePacks = boot.packs.filter((pack) => (pack.target ?? 'client') === (kind === 'server' ? 'server' : 'client'))

  const togglePack = (id: string): void =>
    setPacks((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))

  return (
    <Modal
      title={kind === 'server' ? 'Create server' : 'Create instance'}
      eyebrow={kind === 'server' ? 'New dedicated server' : 'New build'}
      onClose={onClose}
      width={680}
    >
      <div className="field">
        <label>Type</label>
        <div className="segmented wide">
          <button className={kind === 'game' ? 'active' : ''} onClick={() => chooseKind('game')}>
            Game instance
          </button>
          <button className={kind === 'server' ? 'active' : ''} onClick={() => chooseKind('server')}>
            Dedicated server
          </button>
        </div>
        <span className="hint">Servers run headless in their own folder. One game or server can run at a time.</span>
      </div>

      <div className="field">
        <label htmlFor="instance-name">Name</label>
        <input
          id="instance-name"
          value={name}
          maxLength={48}
          onChange={(event) => setName(event.target.value)}
          placeholder={kind === 'server' ? 'Survival Server' : 'Astra'}
        />
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="mc-version">Minecraft version</label>
          <select id="mc-version" value={mcVersion} onChange={(event) => setMcVersion(event.target.value)}>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.id} {version.type !== 'release' ? `(${version.type})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Loader</label>
          <div className="segmented">
            <button className={loader === 'fabric' ? 'active' : ''} onClick={() => setLoader('fabric')}>
              Fabric
            </button>
            <button className={loader === 'vanilla' ? 'active' : ''} onClick={() => setLoader('vanilla')}>
              Vanilla
            </button>
          </div>
        </div>
      </div>

      {kind === 'game' && (
        <div className="field">
          <label>
            Performance profile{' '}
            <span className="hint">
              {profile === 'competitive' ? 'lowest latency' : profile === 'balanced' ? 'recommended' : 'visual quality'}
            </span>
          </label>
          <div className="profile-picker">
            {(
              [
                { id: 'competitive', title: 'Competitive', sub: 'Frames over fidelity' },
                { id: 'balanced', title: 'Balanced', sub: 'The default' },
                { id: 'quality', title: 'Quality', sub: 'Shadows, particles' }
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                className={`profile-option ${profile === item.id ? 'active' : ''}`}
                onClick={() => setProfile(item.id)}
              >
                <strong>{item.title}</strong>
                <span>{item.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label className="label-row">
          <span>Memory</span>
          <b>{Math.round(memory / 1024)} GB</b>
        </label>
        <input
          type="range"
          min={2048}
          max={Math.min(16384, Math.max(4096, Math.round(hardware.ramGb * 1024 * 0.5)))}
          step={512}
          value={memory}
          onChange={(event) => setMemory(Number(event.target.value))}
        />
        <span className="hint">
          Recommended {Math.round(hardware.recommendedMemoryMb / 1024)} GB for this system.
          {kind === 'server' ? ' Server worlds grow; leave 2 GB for the OS.' : ''}
        </span>
      </div>

      {kind === 'server' && (
        <div className="form-grid">
          <div className="field">
            <label htmlFor="server-port">Server port</label>
            <input
              id="server-port"
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(event) => setPort(Number(event.target.value))}
            />
            <span className="hint">Default 25565. Port-forward it for public access.</span>
          </div>
          <label className="eula-row eula-create">
            <input type="checkbox" checked={eula} onChange={(event) => setEula(event.target.checked)} />
            <span>
              <strong>Accept the Minecraft EULA</strong>
              <small>
                Required to start. Read it at{' '}
                <button
                  type="button"
                  className="link"
                  onClick={() => void api.openExternal('https://www.minecraft.net/en-us/eula')}
                >
                  minecraft.net/eula
                </button>
                .
              </small>
            </span>
          </label>
        </div>
      )}

      <div className="field">
        <label>
          {kind === 'server' ? 'Server packs' : 'Client packs'}{' '}
          <span className="hint">{loader === 'fabric' ? 'optional, version-matched' : 'Fabric only'}</span>
        </label>
        <div className={`pack-checks ${loader === 'vanilla' ? 'disabled' : ''}`}>
          {availablePacks.map((pack) => (
            <label key={pack.id} className={`pack-check ${loader === 'fabric' && packs.includes(pack.id) ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={loader === 'fabric' && packs.includes(pack.id)}
                disabled={loader === 'vanilla'}
                onChange={() => togglePack(pack.id)}
              />
              <span className="pack-dot" style={{ background: pack.color }} />
              <span>
                <strong>{pack.name}</strong>
                <small>{pack.mods.length} mods</small>
              </span>
            </label>
          ))}
        </div>
        {loader === 'vanilla' && <span className="hint">Vanilla instances run without mods. Choose Fabric to use packs.</span>}
      </div>

      {error && <div className="inline-error">{error}</div>}
      {busy && <Spinner label="Installing game files and mods — this can take a few minutes" />}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void create()} disabled={busy || !mcVersion}>
          <Icon name={kind === 'server' ? 'server' : 'plus'} size={15} />
          {kind === 'server' ? 'Create server' : 'Create instance'}
        </button>
      </div>
    </Modal>
  )
}

export function AccountModal({
  onClose
}: {
  onClose: () => void
}): JSX.Element {
  const { api, boot, settings, toast, refresh } = useApp()
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const signIn = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const info = await api.microsoftLogin()
      setDevice(info)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="Accounts" eyebrow="Identity" onClose={onClose} width={600}>
      <p className="modal-copy">
        Sign in with your Microsoft account to play on online-mode servers and Realms.
      </p>

      {boot.accounts.length > 0 && (
        <div className="account-list">
          {boot.accounts.map((account) => (
            <button
              key={account.id}
              className={`account-row ${account.active ? 'active' : ''}`}
              onClick={() => void api.setActiveAccount(account.id).then(() => refresh())}
            >
              <span className="avatar avatar-sm">{account.name.slice(0, 1).toUpperCase()}</span>
              <span>
                <strong className="name-with-badge">
                  {account.name}
                  {account.active && <CosmeticBadge id={settings.equippedBadge} size={14} />}
                </strong>
                <small>Microsoft account</small>
              </span>
              {account.active && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}

      {device ? (
        <div className="device-code">
          <span className="eyebrow">Enter this code</span>
          <strong>{device.userCode}</strong>
          <button
            className="link"
            onClick={() => void api.openExternal(device.verificationUri)}
          >
            {device.verificationUri}
          </button>
          <div className="device-wait">
            <span className="spinner spinner-sm" /> Waiting for Microsoft…
          </div>
        </div>
      ) : (
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={() => void signIn()} disabled={busy}>
            {busy ? <span className="spinner spinner-sm" /> : <Icon name="user" size={15} />} Sign in with Microsoft
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      {error && <div className="inline-error">{error}</div>}
      <div className="fine-print">
        Tokens are stored locally in your Polaris data folder. Polaris never sends them anywhere except Microsoft and Mojang
        APIs.
      </div>
    </Modal>
  )
}
