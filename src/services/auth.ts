import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth'
import { auth } from './firebase'
import { createUserProfile, getUserProfile } from './firestore'
import { Persona, AppUser } from '@/types'

// Prevents onAuthStateChanged from racing with createUserProfile during sign-up
let _signUpInProgress = false

export const signUp = async (email: string, password: string, persona: Persona): Promise<AppUser> => {
  _signUpInProgress = true
  try {
    const { user: fbUser } = await createUserWithEmailAndPassword(auth, email, password)
    const appUser = await createUserProfile(fbUser.uid, email, persona)
    return appUser
  } finally {
    _signUpInProgress = false
  }
}

export const signIn = async (email: string, password: string): Promise<AppUser> => {
  const { user: fbUser } = await signInWithEmailAndPassword(auth, email, password)
  let profile = await getUserProfile(fbUser.uid)
  if (!profile) {
    // Profile write failed during sign-up — auto-create a minimal profile so the user can log in
    const defaultPersona: Persona = {
      name: fbUser.email?.split('@')[0] ?? 'Racer',
      dob: '',
      ageGroup: 'adult',
      gender: '',
      roles: [],
      personality: [],
      interests: [],
      difficultyPreference: 'mixed',
      onboardingCompleted: false,
    }
    profile = await createUserProfile(fbUser.uid, fbUser.email ?? email, defaultPersona)
  }
  return profile
}

export const signOut = () => firebaseSignOut(auth)

export const onAuthChange = (
  callback: (user: AppUser | null) => void
): (() => void) => {
  return onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      callback(null)
      return
    }
    // Skip during sign-up: profile write is in flight, AuthScreen will call setUser directly
    if (_signUpInProgress) return
    try {
      const profile = await getUserProfile(fbUser.uid)
      callback(profile)
    } catch {
      callback(null)
    }
  })
}

export const getCurrentIdToken = async (): Promise<string | null> => {
  const user = auth.currentUser
  if (!user) return null
  return user.getIdToken()
}
