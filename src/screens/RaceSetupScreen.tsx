import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'
import { getVehicle } from '@/data/vehicles'

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
  const { selectedVehicleId, raceTopicOverride, setRaceTopicOverride } = useGameStore()
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
