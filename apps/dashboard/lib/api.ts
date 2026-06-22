const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4002'

async function req<T>(path: string, opts: RequestInit = {}): Promise<T | null> {
  const res = await fetch(`${API}${path}`, { credentials: 'include', ...opts })
  if (res.status === 401) {
    // Only redirect if we're not already on the login page
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    return null
  }
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<T>
}

export const loginUser = async (email: string, password: string) => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error('Invalid credentials')
  return res.json()
}

export const logoutUser  = () => req('/auth/logout', { method: 'POST' })
export const getMe       = () => req<{ user: { id: string; email: string; role: string; tenant_id: string } }>('/auth/me')
export const getStats    = () => req<{ stats: { severity: string; count: string }[] }>('/events/stats')
export const getTimeline = () => req<{ timeline: { hour: string; count: string }[] }>('/events/timeline')
export const getSummary  = () => req<{ summary: Record<string, string> }>('/events/summary')

export const getEvents = (params: Record<string, string | number> = {}) => {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v))
  })
  return req<{ events: unknown[]; total: number; limit: number; offset: number }>(`/events?${q}`)
}

export const getEvent = (id: string) => req(`/events/${id}`)