import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'
import { getVehicle } from '@/data/vehicles'
import type { TrackThemeName } from '@/types'

const TRACK_THEMES: { id: TrackThemeName; label: string; desc: string; colors: string[] }[] = [
  {
    id: 'night_city',
    label: 'Night City',
    desc: 'Neon streets, city skyline',
    colors: ['#0a0a1a', '#00ccff', '#cc2222'],
  },
  {
    id: 'desert',
    label: 'Desert Highway',
    desc: 'Sandy dunes, scorching sun',
    colors: ['#7a6040', '#ffaa22', '#cc6611'],
  },
  {
    id: 'mountain',
    label: 'Mountain Pass',
    desc: 'Snow peaks, purple sky',
    colors: ['#38384a', '#9999ee', '#ddddee'],
  },
]

const QUICK_TOPICS = [
  { label: '🎲 Surprise Me', value: null },
  { label: '💻 Programming', value: 'Programming' },
  { label: '🐧 Linux', value: 'Linux' },
  { label: '🐍 Python', value: 'Python' },
  { label: '☕ Java', value: 'Java' },
  { label: '🌐 JavaScript', value: 'JavaScript' },
  { label: '🔀 Git', value: 'Git' },
  { label: '🗄️ SQL', value: 'SQL' },
  { label: '🐳 Docker', value: 'Docker' },
  { label: '🔬 Science', value: 'Science' },
  { label: '📜 History', value: 'History' },
  { label: '🌍 Geography', value: 'Geography' },
  { label: '⚽ Sports', value: 'Sports' },
  { label: '🎬 Movies & TV', value: 'Movies & TV' },
  { label: '🎮 Gaming', value: 'Gaming' },
  { label: '🤖 AI / ML', value: 'AI / Machine Learning' },
  { label: '😜 Fun & Silly', value: 'Fun & Silly' },
  { label: '🍕 Food', value: 'Food & Cooking' },
  { label: '🚀 Space', value: 'Astronomy' },
  { label: '🏎️ Formula 1', value: 'Formula 1' },
]

export default function RaceSetupScreen() {
  const navigate = useNavigate()
  const { selectedVehicleId, raceTopicOverride, setRaceTopicOverride, trackTheme, setTrackTheme } = useGameStore()
  const [customTopic, setCustomTopic] = useState('')

  const vehicle = getVehicle(selectedVehicleId)

  const handleStart = () => {
    if (customTopic.trim()) setRaceTopicOverride(customTopic.trim())
    navigate('/qualify')
  }

  const activeTopic = raceTopicOverride

  return (
    <div className="screen" style={{ paddingTop: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost" style={{ padding: '8px' }} onClick={() => navigate('/home')}>
          ← Back
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Race Setup</h1>
      </div>

      {/* Current vehicle */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>{vehicle.emoji}</span>
          <div>
            <div style={{ fontWeight: 700 }}>{vehicle.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {vehicle.maxSpeedKmh} km/h max
            </div>
          </div>
        </div>
        <button
          className="btn btn-outline"
          style={{ fontSize: 13, padding: '8px 14px' }}
          onClick={() => navigate('/vehicles')}
        >
          Change
        </button>
      </div>

      {/* Track theme picker */}
      <div style={{ marginBottom: 20 }}>
        <p className="section-label">Choose a track theme</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {TRACK_THEMES.map((t) => {
            const active = trackTheme === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTrackTheme(t.id)}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 12,
                  border: `2px solid ${active ? t.colors[1] : 'var(--border)'}`,
                  background: active ? `${t.colors[0]}cc` : 'var(--surface)',
                  cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: active ? `0 0 12px ${t.colors[1]}44` : 'none',
                }}
              >
                {/* Mini track preview */}
                <div style={{
                  height: 38, borderRadius: 8, marginBottom: 8, overflow: 'hidden',
                  background: t.colors[0], position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* Road strip */}
                  <div style={{ width: 14, height: '100%', background: t.colors[0], opacity: 0.8, borderLeft: `2px solid ${t.colors[2]}`, borderRight: `2px solid ${t.colors[2]}` }} />
                  {/* Lane dash */}
                  <div style={{ position: 'absolute', width: 2, height: 10, background: t.colors[1], borderRadius: 1, top: '30%' }} />
                  <div style={{ position: 'absolute', width: 2, height: 10, background: t.colors[1], borderRadius: 1, top: '65%' }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: active ? t.colors[1] : 'var(--text)', textAlign: 'center', lineHeight: 1.3 }}>{t.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2 }}>{t.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Topic picker */}
      <div style={{ marginBottom: 20 }}>
        <p className="section-label">Choose a topic for this race</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {QUICK_TOPICS.map((t) => (
            <span
              key={t.label}
              className={`tag ${activeTopic === t.value ? 'active' : ''}`}
              onClick={() => { setRaceTopicOverride(t.value); setCustomTopic('') }}
            >
              {t.label}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="Or type a custom topic (e.g. React, Cricket...)"
            value={customTopic}
            onChange={(e) => {
              setCustomTopic(e.target.value)
              if (e.target.value) setRaceTopicOverride(e.target.value)
              else setRaceTopicOverride(null)
            }}
          />
        </div>
      </div>

      {/* Race info */}
      <div className="card" style={{ marginBottom: 24 }}>
        <p className="section-label">Race info</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <InfoRow icon="⏱️" label="Duration" value="90 seconds" />
          <InfoRow icon="🤖" label="Opponents" value="4 AI racers" />
          <InfoRow icon="🧠" label="Qualifier" value="5 questions → grid position" />
          <InfoRow icon="🎯" label="Topic" value={activeTopic ?? 'Personalised mix'} />
        </div>
      </div>

      <button
        className="btn btn-primary btn-full btn-lg"
        style={{
          background: 'linear-gradient(135deg, #ff6b35, #cc3300)',
          boxShadow: '0 4px 20px rgba(255,107,53,0.3)',
          fontSize: 18, fontWeight: 900, letterSpacing: '0.06em',
        }}
        onClick={handleStart}
      >
        🧠 Begin Qualifier
      </button>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
      <span style={{ color: 'var(--text-muted)' }}>{icon} {label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  )
}
