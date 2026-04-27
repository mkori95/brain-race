import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore'
import { db } from './firebase'
import { AppUser, Persona, PlayerProgress, VehicleState } from '@/types'
import { STARTER_VEHICLE_ID, VEHICLES, DEFAULT_VEHICLE_STATE } from '@/data/vehicles'

const initialVehicles = (): Record<string, VehicleState> => {
  const map: Record<string, VehicleState> = {}
  for (const v of VEHICLES) {
    map[v.id] = { ...DEFAULT_VEHICLE_STATE, unlocked: v.id === STARTER_VEHICLE_ID }
  }
  return map
}

const initialProgress = (): PlayerProgress => ({
  coins: 0,
  xp: 0,
  level: 'rookie',
  vehicles: initialVehicles(),
  selectedVehicle: STARTER_VEHICLE_ID,
  personalBests: { cars: 0, bikes: 0, trucks: 0 },
  dailyChallenge: { lastCompleted: '', streak: 0 },
  questionHistory: [],
})

export const createUserProfile = async (
  uid: string,
  email: string,
  persona: Persona
): Promise<AppUser> => {
  const progress = initialProgress()
  const data = { uid, email, persona, progress }
  await setDoc(doc(db, 'users', uid), data)
  return data as AppUser
}

export const getUserProfile = async (uid: string): Promise<AppUser | null> => {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  return snap.data() as AppUser
}

export const updatePersona = async (uid: string, persona: Persona): Promise<void> => {
  await updateDoc(doc(db, 'users', uid), { persona })
}

export const updateProgress = async (
  uid: string,
  updates: Partial<PlayerProgress>
): Promise<void> => {
  const mapped: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(updates)) {
    mapped[`progress.${key}`] = val
  }
  await updateDoc(doc(db, 'users', uid), mapped)
}

export const saveSelectedVehicle = async (uid: string, vehicleId: string): Promise<void> => {
  await updateDoc(doc(db, 'users', uid), { 'progress.selectedVehicle': vehicleId })
}

export const addSeenQuestions = async (uid: string, ids: string[]): Promise<void> => {
  await updateDoc(doc(db, 'users', uid), {
    'progress.questionHistory': arrayUnion(...ids),
  })
}

export const updateVehicleState = async (
  uid: string,
  vehicleId: string,
  state: Partial<VehicleState>
): Promise<void> => {
  const mapped: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(state)) {
    mapped[`progress.vehicles.${vehicleId}.${key}`] = val
  }
  await updateDoc(doc(db, 'users', uid), mapped)
}
