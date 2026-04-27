import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'
import { VEHICLES, UPGRADE_COSTS, getVehicle } from '@/data/vehicles'
import { VehicleCategory } from '@/types'
import { updateVehicleState } from '@/services/firestore'
import { getCurrentIdToken } from '@/services/auth'

const TABS: { label: string; value: VehicleCategory }[] = [
  { label: '🏎️ Cars', value: 'car' },
  { label: '🏍️ Bikes', value: 'bike' },
  { label: '🚛 Trucks', value: 'truck' },
]

const SPEED_LABELS: Record<string, string> = {
  very_slow: '●○○○○', slow: '●●○○○', medium: '●●●○○',
  fast: '●●●●○', very_fast: '●●●●●', insane: '●●●●●+', insane_plus: '●●●●●++',
}

export default function VehicleSelectionScreen() {
  const navigate = useNavigate()
  const { user, selectedVehicleId, setSelectedVehicle, updateProgress } = useGameStore()
  const [tab, setTab] = useState<VehicleCategory>('car')
  const [upgrading, setUpgrading] = useState(false)

  if (!user) return null

  const { progress } = user
  const filtered = VEHICLES.filter((v) => v.category === tab)
  const selected = getVehicle(selectedVehicleId)
  const selectedState = progress.vehicles[selectedVehicleId]

  const isUnlocked = (id: string) => progress.vehicles[id]?.unlocked ?? false
  const canAfford = (cost: number) => progress.coins >= cost

  const handleBuy = async (vehicleId: string, cost: number) => {
    if (!canAfford(cost)) return
    try {
      const token = await getCurrentIdToken()
      if (!token) return

      const res = await fetch('/api/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid: user.uid, action: 'buy_vehicle', cost, vehicleId }),
      })
      if (!res.ok) throw new Error('Purchase failed')

      await updateVehicleState(user.uid, vehicleId, { unlocked: true })
      const newVehicles = {
        ...progress.vehicles,
        [vehicleId]: { ...progress.vehicles[vehicleId], unlocked: true },
      }
      updateProgress({ vehicles: newVehicles, coins: progress.coins - cost })
    } catch (e) {
      console.error(e)
    }
  }

  const handleUpgrade = async (upgradeType: 'engine' | 'tires' | 'nitro') => {
    const currentLevel = selectedState?.[`${upgradeType}Level` as keyof typeof selectedState] as number ?? 0
    if (currentLevel >= 5) return
    const cost = UPGRADE_COSTS[upgradeType][currentLevel]
    if (!canAfford(cost)) return

    setUpgrading(true)
    try {
      await updateVehicleState(user.uid, selectedVehicleId, { [`${upgradeType}Level`]: currentLevel + 1 })
      const newVehicles = {
        ...progress.vehicles,
        [selectedVehicleId]: { ...progress.vehicles[selectedVehicleId], [`${upgradeType}Level`]: currentLevel + 1 },
      }
      updateProgress({ vehicles: newVehicles, coins: progress.coins - cost })
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <div className="screen" style={{ paddingTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost" style={{ padding: '8px' }} onClick={() => navigate(-1)}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Garage</h1>
        <div style={{ marginLeft: 'auto', color: 'var(--gold)', fontWeight: 700 }}>
          🪙 {progress.coins.toLocaleString()}
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: 4, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.value}
            className="btn"
            style={{
              flex: 1, fontSize: 13,
              background: tab === t.value ? 'var(--card)' : 'transparent',
              color: tab === t.value ? 'var(--text)' : 'var(--text-muted)',
              padding: '8px 4px',
            }}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Vehicle grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {filtered.map((v) => {
          const unlocked = isUnlocked(v.id)
          const isSelected = v.id === selectedVehicleId
          return (
            <div
              key={v.id}
              className={`vehicle-card ${isSelected ? 'selected' : ''} ${!unlocked ? 'locked' : ''}`}
              onClick={() => unlocked && setSelectedVehicle(v.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 28 }}>{v.emoji}</span>
                {isSelected && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>SELECTED</span>}
                {!unlocked && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>🔒</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{v.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{v.maxSpeedKmh} km/h</div>
              <div style={{ fontSize: 12, color: 'var(--secondary)' }}>
                {SPEED_LABELS[v.acceleration] ?? '●●●○○'}
              </div>
              {!unlocked && (
                <button
                  className="btn btn-gold"
                  style={{ fontSize: 12, padding: '6px 10px', marginTop: 4 }}
                  onClick={(e) => { e.stopPropagation(); handleBuy(v.id, v.coinCost) }}
                  disabled={!canAfford(v.coinCost)}
                >
                  🪙 {v.coinCost.toLocaleString()}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Upgrade panel for selected vehicle */}
      {selectedState && (
        <div className="card">
          <p className="section-label">Upgrade: {selected.name}</p>
          {(['engine', 'tires', 'nitro'] as const).map((type) => {
            const level = (selectedState[`${type}Level` as keyof typeof selectedState] as number) ?? 0
            const maxed = level >= 5
            const nextCost = maxed ? null : UPGRADE_COSTS[type][level]
            const icons = { engine: '⚙️', tires: '🛞', nitro: '💨' }
            const desc = { engine: '+5% max speed', tires: 'Better handling', nitro: '+10% acceleration' }
            return (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>{icons[type]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
                      {type} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— {desc[type]}</span>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lv {level}/5</span>
                  </div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1, height: 6, borderRadius: 3,
                          background: i < level ? 'var(--primary)' : 'var(--surface)',
                        }}
                      />
                    ))}
                  </div>
                </div>
                {!maxed ? (
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: 12, padding: '6px 10px', whiteSpace: 'nowrap' }}
                    onClick={() => handleUpgrade(type)}
                    disabled={upgrading || !canAfford(nextCost!)}
                  >
                    🪙 {nextCost?.toLocaleString()}
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--success)' }}>MAX</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button
        className="btn btn-primary btn-full btn-lg"
        style={{ marginTop: 20 }}
        onClick={() => navigate('/race-setup')}
      >
        ✅ Confirm & Race
      </button>
    </div>
  )
}
