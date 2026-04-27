import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useGameStore } from './store/useGameStore'
import { onAuthChange } from './services/auth'

import OnboardingScreen    from './screens/OnboardingScreen'
import AuthScreen          from './screens/AuthScreen'
import HomeScreen          from './screens/HomeScreen'
import RaceSetupScreen     from './screens/RaceSetupScreen'
import VehicleSelectionScreen from './screens/VehicleSelectionScreen'
import RaceScreen          from './screens/RaceScreen'
import PostRaceScreen      from './screens/PostRaceScreen'
import GarageScreen        from './screens/GarageScreen'
import DailyChallengeScreen from './screens/DailyChallengeScreen'
import ProfileScreen       from './screens/ProfileScreen'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, authLoading } = useGameStore()
  if (authLoading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function LoadingScreen() {
  return (
    <div className="center" style={{ height: '100vh', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 40 }}>🏎️</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading BrainRace...</div>
    </div>
  )
}

export default function App() {
  const { setUser, setAuthLoading } = useGameStore()

  useEffect(() => {
    const unsub = onAuthChange((user) => {
      setUser(user)
      setAuthLoading(false)
    })
    return unsub
  }, [setUser, setAuthLoading])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/onboarding" element={<OnboardingScreen />} />
        <Route path="/auth"       element={<AuthScreen />} />

        {/* Protected routes */}
        <Route path="/home"      element={<AuthGuard><HomeScreen /></AuthGuard>} />
        <Route path="/race-setup" element={<AuthGuard><RaceSetupScreen /></AuthGuard>} />
        <Route path="/vehicles"  element={<AuthGuard><VehicleSelectionScreen /></AuthGuard>} />
        <Route path="/race"      element={<AuthGuard><RaceScreen /></AuthGuard>} />
        <Route path="/post-race" element={<AuthGuard><PostRaceScreen /></AuthGuard>} />
        <Route path="/garage"    element={<AuthGuard><GarageScreen /></AuthGuard>} />
        <Route path="/daily"     element={<AuthGuard><DailyChallengeScreen /></AuthGuard>} />
        <Route path="/profile"   element={<AuthGuard><ProfileScreen /></AuthGuard>} />

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
