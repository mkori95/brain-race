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

export const signUp = async (email: string, password: string, persona: Persona): Promise<AppUser> => {
  const { user: fbUser } = await createUserWithEmailAndPassword(auth, email, password)
  const appUser = await createUserProfile(fbUser.uid, email, persona)
  return appUser
}

export const signIn = async (email: string, password: string): Promise<AppUser> => {
  const { user: fbUser } = await signInWithEmailAndPassword(auth, email, password)
  const profile = await getUserProfile(fbUser.uid)
  if (!profile) throw new Error('User profile not found. Please sign up again.')
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
