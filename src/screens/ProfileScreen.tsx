import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/store/useGameStore'
import { updatePersona } from '@/services/firestore'
import { DifficultyPreference } from '@/types'

const INTEREST_GROUPS: Record<string, string[]> = {
  '💻 Programming & Tech': ['Linux', 'Git', 'Python', 'Java', 'JavaScript', 'TypeScript', 'SQL', 'Docker', 'Kubernetes', 'Networking', 'Cybersecurity', 'AI / Machine Learning', 'Data Structures & Algorithms', 'Web Development', 'DevOps', 'Cloud (AWS/GCP/Azure)', 'Mobile Dev', 'Open Source'],
  '🔬 Science': ['Physics', 'Chemistry', 'Biology', 'Astronomy', 'Environment & Climate', 'Human Body'],
  '🎬 Arts & Culture': ['Movies & TV', 'Music', 'Art & Design', 'Literature & Books', 'Fashion'],
  '⚽ Sports': ['Football', 'Cricket', 'Formula 1', 'Basketball', 'Olympics', 'Tennis', 'eSports'],
  '📜 History': ['Ancient History', 'World Wars', 'Civilizations', 'Famous People', 'Modern History'],
  '🌍 Geography': ['World Capitals', 'Countries & Flags', 'Oceans & Mountains', 'World Records'],
  '😜 Fun & Silly': ['Riddles', 'Weird & Wild Facts', 'Would You Rather', 'Memes & Pop Culture', 'Animal Facts'],
  '🍕 Lifestyle': ['Food & Cooking', 'Travel', 'Health & Fitness', 'Parenting', 'Personal Finance'],
  '📐 Academic': ['Math & Logic', 'Language & Grammar', 'Philosophy', 'General Knowledge'],
  '🎮 Gaming': ['Video Games', 'Board Games', 'Game Trivia', 'Retro Games'],
}

function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]
}

export default function ProfileScreen() {
  const navigate = useNavigate()
  const { user, updatePersona: storeUpdatePersona } = useGameStore()

  if (!user) return null

  const [persona, setPersona] = useState({ ...user.persona })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (g: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })

  const handleSave = async () => {
    setSaving(true)
    try {
      await updatePersona(user.uid, persona)
      storeUpdatePersona(persona)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="screen" style={{ paddingTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost" style={{ padding: '8px' }} onClick={() => navigate('/home')}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Profile & Settings</h1>
      </div>

      {/* Account info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-label">Account</p>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{user.email}</div>
      </div>

      {/* Name */}
      <div className="card" style={{ marginBottom: 12 }}>
        <p className="section-label">Display Name</p>
        <input
          className="input"
          value={persona.name}
          onChange={(e) => setPersona({ ...persona, name: e.target.value })}
          placeholder="Your name"
        />
      </div>

      {/* Difficulty */}
      <div className="card" style={{ marginBottom: 12 }}>
        <p className="section-label">Question Difficulty</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['easy', 'mixed', 'hard'] as DifficultyPreference[]).map((d) => (
            <span
              key={d}
              className={`tag ${persona.difficultyPreference === d ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setPersona({ ...persona, difficultyPreference: d })}
            >
              {d === 'easy' ? '😌 Easy' : d === 'mixed' ? '⚡ Mixed' : '🔥 Hard'}
            </span>
          ))}
        </div>
      </div>

      {/* Interests */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p className="section-label">
          Interests ({persona.interests.length} selected)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {Object.entries(INTEREST_GROUPS).map(([group, topics]) => (
            <div key={group} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', padding: '6px 0' }}
                onClick={() => toggleGroup(group)}
              >
                <span style={{ fontWeight: 600, fontSize: 13 }}>{group}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {persona.interests.filter((i) => topics.includes(i)).length > 0
                    ? `${persona.interests.filter((i) => topics.includes(i)).length} ✓`
                    : ''}{' '}
                  {expandedGroups.has(group) ? '▲' : '▼'}
                </span>
              </div>
              {expandedGroups.has(group) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {topics.map((t) => (
                    <span
                      key={t}
                      className={`tag ${persona.interests.includes(t) ? 'active' : ''}`}
                      style={{ fontSize: 12 }}
                      onClick={() => setPersona({ ...persona, interests: toggle(persona.interests, t) })}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        className={`btn btn-full btn-lg ${saved ? 'btn-success' : 'btn-primary'}`}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Changes'}
      </button>

      <button
        className="btn btn-ghost btn-full"
        style={{ marginTop: 10, fontSize: 13 }}
        onClick={() => navigate('/onboarding')}
      >
        🔄 Re-run profile setup
      </button>
    </div>
  )
}
