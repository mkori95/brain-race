import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Persona, AgeGroup, DifficultyPreference } from '@/types'

const ROLES = [
  'Developer / Engineer', 'Student', 'Teacher', 'Doctor / Healthcare',
  'Artist / Creative', 'Gamer', 'Homemaker', 'Business / Finance', 'Retired', 'Just here for fun',
]
const PERSONALITIES = ['Curious', 'Competitive', 'Casual', 'Funny / Silly', 'Serious', 'Explorer']

const INTEREST_GROUPS: Record<string, string[]> = {
  '💻 Programming & Tech': [
    'Linux', 'Git', 'Python', 'Java', 'JavaScript', 'TypeScript', 'SQL', 'Docker',
    'Kubernetes', 'Networking', 'Cybersecurity', 'AI / Machine Learning',
    'Data Structures & Algorithms', 'Web Development', 'DevOps', 'Cloud (AWS/GCP/Azure)',
    'Mobile Dev', 'Open Source',
  ],
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

const calcAgeGroup = (dob: string): AgeGroup => {
  if (!dob) return 'adult'
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))
  if (age < 13) return 'kid'
  if (age < 18) return 'teen'
  if (age < 30) return 'youngAdult'
  if (age < 60) return 'adult'
  return 'senior'
}

const TOTAL_STEPS = 5

interface FormData {
  name: string
  dob: string
  gender: string
  roles: string[]
  personality: string[]
  interests: string[]
  difficultyPreference: DifficultyPreference
}

const empty: FormData = {
  name: '', dob: '', gender: '', roles: [], personality: [],
  interests: [], difficultyPreference: 'mixed',
}

function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]
}

export default function OnboardingScreen() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(empty)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  const back = () => setStep((s) => Math.max(s - 1, 1))

  const toggleGroup = (g: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })

  const finish = () => {
    const persona: Persona = {
      name: form.name || 'Racer',
      dob: form.dob,
      ageGroup: calcAgeGroup(form.dob),
      gender: form.gender,
      roles: form.roles,
      personality: form.personality,
      interests: form.interests.length ? form.interests : ['General Knowledge'],
      difficultyPreference: form.difficultyPreference,
      onboardingCompleted: true,
    }
    localStorage.setItem('br_persona', JSON.stringify(persona))
    navigate('/auth')
  }

  const canProceed =
    (step === 1 && form.name.trim().length > 0) ||
    step === 2 || step === 3 || step === 4 || step === 5

  return (
    <div className="screen" style={{ paddingTop: 32 }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🏎️</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--primary)' }}>BrainRace</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
          Step {step} of {TOTAL_STEPS} — set up your race profile
        </p>
      </div>

      {/* Progress */}
      <div className="progress-track" style={{ marginBottom: 28 }}>
        <div className="progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
      </div>

      {/* ── Step 1: Basic Info ─────────────────────────────── */}
      {step === 1 && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Tell us about yourself</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Your name *</label>
            <input
              className="input"
              placeholder="Enter your name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Date of birth</label>
            <input
              className="input"
              type="date"
              value={form.dob}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setForm({ ...form, dob: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Gender (optional)</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Male', 'Female', 'Non-binary', 'Prefer not to say'].map((g) => (
                <span
                  key={g}
                  className={`tag ${form.gender === g ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, gender: form.gender === g ? '' : g })}
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Roles & Personality ─────────────────────── */}
      {step === 2 && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Who are you?</h2>

          <div>
            <p className="section-label">Your role (pick all that apply)</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ROLES.map((r) => (
                <span
                  key={r}
                  className={`tag ${form.roles.includes(r) ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, roles: toggle(form.roles, r) })}
                >
                  {r}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="section-label">Your personality (pick up to 3)</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PERSONALITIES.map((p) => (
                <span
                  key={p}
                  className={`tag ${form.personality.includes(p) ? 'active' : ''}`}
                  onClick={() => {
                    if (form.personality.includes(p)) {
                      setForm({ ...form, personality: form.personality.filter((x) => x !== p) })
                    } else if (form.personality.length < 3) {
                      setForm({ ...form, personality: [...form.personality, p] })
                    }
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Interests ─────────────────────────────────── */}
      {step === 3 && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>What do you love?</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
              Questions will be tailored to your interests.{' '}
              <span
                style={{ color: 'var(--primary)', cursor: 'pointer' }}
                onClick={() => setForm({ ...form, interests: [] })}
              >
                Surprise me
              </span>
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
            {Object.entries(INTEREST_GROUPS).map(([group, topics]) => (
              <div key={group} className="card" style={{ padding: '10px 14px' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => toggleGroup(group)}
                >
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{group}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {form.interests.filter((i) => topics.includes(i)).length > 0
                      ? `${form.interests.filter((i) => topics.includes(i)).length} selected`
                      : ''}{' '}
                    {expandedGroups.has(group) ? '▲' : '▼'}
                  </span>
                </div>
                {expandedGroups.has(group) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {topics.map((t) => (
                      <span
                        key={t}
                        className={`tag ${form.interests.includes(t) ? 'active' : ''}`}
                        style={{ fontSize: 12 }}
                        onClick={() => setForm({ ...form, interests: toggle(form.interests, t) })}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {form.interests.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--secondary)' }}>
              ✓ {form.interests.length} topic{form.interests.length > 1 ? 's' : ''} selected
            </p>
          )}
        </div>
      )}

      {/* ── Step 4: Difficulty ─────────────────────────────────── */}
      {step === 4 && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>How tough do you want it?</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            This sets the default difficulty of questions generated for you.
          </p>
          {([
            { val: 'easy',  label: 'Easy — keep it chill',           emoji: '😌', desc: 'Simple, fun questions for everyone' },
            { val: 'mixed', label: 'Mix it up',                       emoji: '⚡', desc: 'Easy and medium questions, keeps it interesting' },
            { val: 'hard',  label: 'Bring the challenge',             emoji: '🔥', desc: 'Harder questions, bigger satisfaction when right' },
          ] as { val: DifficultyPreference; label: string; emoji: string; desc: string }[]).map((opt) => (
            <div
              key={opt.val}
              className="card"
              onClick={() => setForm({ ...form, difficultyPreference: opt.val })}
              style={{
                cursor: 'pointer',
                border: form.difficultyPreference === opt.val
                  ? '2px solid var(--primary)'
                  : '1.5px solid var(--border)',
                display: 'flex',
                gap: 14,
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 28 }}>{opt.emoji}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{opt.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
              </div>
              {form.difficultyPreference === opt.val && (
                <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontWeight: 700 }}>✓</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Step 5: Summary ────────────────────────────────────── */}
      {step === 5 && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>You're all set, {form.name || 'Racer'}! 🎉</h2>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Row label="Name" value={form.name || '—'} />
            <Row label="Age Group" value={form.dob ? calcAgeGroup(form.dob).replace(/([A-Z])/g, ' $1') : '—'} />
            <Row label="Roles" value={form.roles.join(', ') || 'Not specified'} />
            <Row label="Interests" value={form.interests.length ? `${form.interests.length} topics` : 'General mix'} />
            <Row label="Difficulty" value={form.difficultyPreference} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            Create your account on the next screen. You can always update this from Profile Settings.
          </p>
        </div>
      )}

      {/* Nav buttons */}
      <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', gap: 10 }}>
        {step > 1 && (
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={back}>← Back</button>
        )}
        {step < TOTAL_STEPS ? (
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            onClick={next}
            disabled={!canProceed}
          >
            Continue →
          </button>
        ) : (
          <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={finish}>
            Create Account →
          </button>
        )}
      </div>

      {step === 1 && (
        <button
          className="btn btn-ghost"
          style={{ marginTop: 12, fontSize: 13 }}
          onClick={() => navigate('/auth')}
        >
          Already have an account? Log in
        </button>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  )
}
