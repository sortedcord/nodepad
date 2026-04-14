"use client"

export interface AuthUser {
  id: string
  username: string
  passwordSalt: string
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
  return crypto.randomUUID()
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
  if (typeof window === "undefined" || !crypto?.subtle) {
    throw new Error("Secure password hashing is unavailable in this environment.")
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const salt = btoa(String.fromCharCode(...bytes))
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 150000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  )
  const hashBytes = new Uint8Array(bits)
  const hash = Array.from(hashBytes).map(b => b.toString(16).padStart(2, "0")).join("")
  return { salt, hash }
}

async function verifyPassword(password: string, salt: string) {
  if (typeof window === "undefined" || !crypto?.subtle) {
    throw new Error("Secure password hashing is unavailable in this environment.")
  }
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 150000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  )
  const hashBytes = new Uint8Array(bits)
  return Array.from(hashBytes).map(b => b.toString(16).padStart(2, "0")).join("")
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
  const rawPassword = password

  if (!cleanUsername) return { error: "Username is required." }
  if (cleanUsername.length < 3) return { error: "Username must be at least 3 characters." }
  if (!rawPassword) return { error: "Password is required." }
  if (rawPassword.length < 8) return { error: "Password must be at least 8 characters." }

  const users = readUsers()
  const exists = users.some(u => normalizeUsername(u.username) === normalized)
  if (exists) return { error: "An account with this username already exists." }

  const { salt, hash } = await hashPassword(rawPassword)
  const newUser: AuthUser = {
    id: generateId(),
    username: cleanUsername,
    passwordSalt: salt,
    passwordHash: hash,
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

  if (!found.passwordSalt) return { error: "This account format is no longer supported. Please register again." }
  const passwordHash = await verifyPassword(password, found.passwordSalt)
  if (passwordHash !== found.passwordHash) return { error: "Incorrect password." }

  const sessionUser: SessionUser = { id: found.id, username: found.username, loginAt: Date.now() }
  setSession(sessionUser)
  return { user: sessionUser }
}
