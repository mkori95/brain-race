import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'
import { VEHICLES, UPGRADE_COSTS } from '@/data/vehicles'

export default function GarageScreen() {
  const navigate = useNavigate()
  const { user } = useGameStore()

  if (!user) return null
  const { progress } = user

  const unlockedCount = VEHICLES.filter((v) => progress.vehicles[v.id]?.unlocked).length

  return (
    <div className="screen" style={{ paddingTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost" style={{ padding: '8px' }} onClick={() => navigate('/home')}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Garage</h1>
        <div style={{ marginLeft: 'auto', color: 'var(--gold)', fontWeight: 700 }}>
          🪙 {progress.coins.toLocaleString()}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-around', padding: 14 }}>
        <div className="stat-badge">
          <span className="value">{unlockedCount}</span>
          <span className="label">Unlocked</span>
        </div>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <div className="stat-badge">
          <span className="value">{VEHICLES.length}</span>
          <span className="label">Total</span>
        </div>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <div className="stat-badge">
          <span className="value">{VEHICLES.length - unlockedCount}</span>
          <span className="label">Locked</span>
        </div>
      </div>

      <button
        className="btn btn-primary btn-full"
        style={{ marginBottom: 20 }}
        onClick={() => navigate('/vehicles')}
      >
        🏎️ Buy & Upgrade Vehicles →
      </button>

      <p className="section-label">All vehicles</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {VEHICLES.map((v) => {
          const state = progress.vehicles[v.id]
          const unlocked = state?.unlocked ?? false
          return (
            <div key={v.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
              <span style={{ fontSize: 24, opacity: unlocked ? 1 : 0.4 }}>{v.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: unlocked ? 'var(--text)' : 'var(--text-muted)' }}>
                  {v.name} {!unlocked && '🔒'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {v.maxSpeedKmh} km/h · {v.category}
                </div>
              </div>
              {unlocked && (
                <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
                  <UpgradePip label="⚙️" level={state?.engineLevel ?? 0} />
                  <UpgradePip label="🛞" level={state?.tiresLevel ?? 0} />
                  <UpgradePip label="💨" level={state?.nitroLevel ?? 0} />
                </div>
              )}
              {!unlocked && (
                <span style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>
                  🪙 {v.coinCost.toLocaleString()}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UpgradePip({ label, level }: { label: string; level: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div>{label}</div>
      <div style={{ fontSize: 10, color: level > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
        Lv{level}
      </div>
    </div>
  )
}
