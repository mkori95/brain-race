import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, signUp } from '@/services/auth'
import { useGameStore } from '@/store/useGameStore'
import { Persona } from '@/types'

type Mode = 'login' | 'signup'

export default function AuthScreen() {
  const navigate = useNavigate()
  const { setUser } = useGameStore()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const savedPersona = (): Persona | null => {
    try {
      const raw = localStorage.getItem('br_persona')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const persona = savedPersona()
        if (!persona) {
          navigate('/onboarding')
          return
        }
        const user = await signUp(email, password, persona)
        localStorage.removeItem('br_persona')
        setUser(user)
        navigate('/home')
      } else {
        const user = await signIn(email, password)
        setUser(user)
        navigate('/home')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(friendlyError(msg))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen center" style={{ minHeight: '100vh', paddingTop: 0 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏎️</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--primary)' }}>BrainRace</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>Race with your brain</p>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: 'flex',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-sm)',
            padding: 4,
            marginBottom: 24,
          }}
        >
          {(['login', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              className="btn"
              style={{
                flex: 1,
                background: mode === m ? 'var(--card)' : 'transparent',
                color: mode === m ? 'var(--text)' : 'var(--text-muted)',
                padding: '10px',
                fontSize: 14,
                borderRadius: 'var(--radius-sm)',
              }}
              onClick={() => { setMode(m); setError('') }}
            >
              {m === 'login' ? 'Log In' : 'Sign Up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="input"
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            className="input"
            type="password"
            placeholder="Password (min. 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid var(--error)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                fontSize: 13,
                color: 'var(--error)',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            style={{ marginTop: 4 }}
            disabled={loading}
          >
            {loading ? '...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        {mode === 'signup' && !savedPersona() && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 14px',
              background: 'rgba(255,107,53,0.1)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(255,107,53,0.3)',
              fontSize: 13,
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            New here?{' '}
            <span
              style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => navigate('/onboarding')}
            >
              Set up your race profile first →
            </span>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-dim)', marginTop: 24 }}>
          Your data is stored securely. No spam, ever.
        </p>
      </div>
    </div>
  )
}

function friendlyError(msg: string): string {
  if (msg.includes('user-not-found') || msg.includes('invalid-credential')) return 'Email or password is incorrect.'
  if (msg.includes('email-already-in-use')) return 'An account with this email already exists. Try logging in.'
  if (msg.includes('weak-password')) return 'Password must be at least 6 characters.'
  if (msg.includes('invalid-email')) return 'Please enter a valid email address.'
  if (msg.includes('profile not found')) return msg
  return 'Something went wrong. Please try again.'
}
