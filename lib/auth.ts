"use client"

export interface AuthUser {
  id: string
  username: string
  passwordHash: string
  createdAt: number
}

export interface SessionUser {
  id: string
  username: string
  loginAt: number
}

const USERS_STORAGE_KEY = "nodepad-users"
const SESSION_STORAGE_KEY = "nodepad-session"

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase()
}

function safeParseUsers(raw: string | null): AuthUser[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readUsers(): AuthUser[] {
  if (typeof window === "undefined") return []
  return safeParseUsers(localStorage.getItem(USERS_STORAGE_KEY))
}

function writeUsers(users: AuthUser[]) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
}

async function hashPassword(password: string) {
  if (typeof window === "undefined") return password
  const data = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const bytes = new Uint8Array(digest)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
}

export function getSessionUser(): SessionUser | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionUser
    if (!parsed?.id || !parsed?.username) return null
    return parsed
  } catch {
    return null
  }
}

export function clearSession() {
  if (typeof window === "undefined") return
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

function setSession(user: SessionUser) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user))
}

export async function registerUser(username: string, password: string): Promise<{ user?: SessionUser; error?: string }> {
  const cleanUsername = username.trim()
  const normalized = normalizeUsername(cleanUsername)
  const cleanPassword = password.trim()

  if (!cleanUsername) return { error: "Username is required." }
  if (cleanUsername.length < 3) return { error: "Username must be at least 3 characters." }
  if (!cleanPassword) return { error: "Password is required." }
  if (cleanPassword.length < 8) return { error: "Password must be at least 8 characters." }

  const users = readUsers()
  const exists = users.some(u => normalizeUsername(u.username) === normalized)
  if (exists) return { error: "An account with this username already exists." }

  const newUser: AuthUser = {
    id: generateId(),
    username: cleanUsername,
    passwordHash: await hashPassword(cleanPassword),
    createdAt: Date.now(),
  }

  writeUsers([...users, newUser])
  const sessionUser: SessionUser = { id: newUser.id, username: newUser.username, loginAt: Date.now() }
  setSession(sessionUser)
  return { user: sessionUser }
}

export async function loginUser(username: string, password: string): Promise<{ user?: SessionUser; error?: string }> {
  const normalized = normalizeUsername(username)
  const users = readUsers()
  const found = users.find(u => normalizeUsername(u.username) === normalized)
  if (!found) return { error: "No account found for this username." }

  const passwordHash = await hashPassword(password.trim())
  if (passwordHash !== found.passwordHash) return { error: "Incorrect password." }

  const sessionUser: SessionUser = { id: found.id, username: found.username, loginAt: Date.now() }
  setSession(sessionUser)
  return { user: sessionUser }
}
