const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4002'

async function req<T = any>(path: string, opts: RequestInit = {}): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      credentials: 'include',   // ALWAYS send auth cookie
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers ?? {})
      }
    })
    if (res.status === 401) {
      if (typeof window !== 'undefined') window.location.href = '/login'
      return null
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error ?? `API error ${res.status}`)
    }
    return res.json()
  } catch (err) {
    console.error(`API ${path} failed:`, err)
    throw err
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) throw new Error('Invalid credentials')
  return res.json()
}

export async function logoutUser() {
  return req('/auth/logout', { method: 'POST' })
}

export async function getMe() {
  return req('/auth/me')
}

// ── Events ──────────────────────────────────────────────────────────────────

export interface EventQuery {
  limit?:    number
  offset?:   number
  severity?: string
  search?:   string
  from?:     string
  to?:       string
}

export async function getEvents(params: EventQuery = {}) {
  const q = new URLSearchParams()
  if (params.limit    != null) q.set('limit',    String(params.limit))
  if (params.offset   != null) q.set('offset',   String(params.offset))
  if (params.severity)         q.set('severity', params.severity)
  if (params.search)           q.set('search',   params.search)
  if (params.from)             q.set('from',     params.from)
  if (params.to)               q.set('to',       params.to)

  return req<{ events: any[]; total: number; limit: number; offset: number }>(
    `/events?${q.toString()}`
  )
}

export async function getStats() {
  return req<{ stats: { severity: string; count: string }[] }>('/events/stats')
}

export async function getTimeline() {
  return req<{ timeline: { hour: string; count: string }[] }>('/events/timeline')
}

export async function getSummary() {
  return req<{ summary: any }>('/events/summary')
}

export async function getEvent(id: string) {
  return req(`/events/${id}`)
}