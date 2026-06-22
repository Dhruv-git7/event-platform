'use client'
import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getMe, logoutUser } from '../lib/api'

interface AuthUser {
  id: string
  email: string
  role: string
  tenant_id: string
}

interface AuthContextType {
  user:    AuthUser | null
  loading: boolean
  logout:  () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user:    null,
  loading: true,
  logout:  async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router   = useRouter()
  const pathname = usePathname()
  const checked  = useRef(false)   // ← prevents double-check in React StrictMode

  useEffect(() => {
    // Already ran — skip (React StrictMode mounts twice in dev)
    if (checked.current) return
    checked.current = true

    getMe()
      .then((data: unknown) => {
        const d = data as { user?: AuthUser } | null
        if (d?.user) {
          setUser(d.user)
          // If they landed on /login while already logged in, send to dashboard
          if (pathname === '/login') router.replace('/')
        } else {
          // Not authenticated
          if (pathname !== '/login') router.replace('/login')
        }
      })
      .catch(() => {
        if (pathname !== '/login') router.replace('/login')
      })
      .finally(() => {
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])   // ← deliberately empty — run once on mount only

  const logout = async () => {
    await logoutUser().catch(() => {})
    setUser(null)
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500 text-sm">
          <span className="w-4 h-4 border-2 border-gray-700 border-t-purple-500 rounded-full animate-spin" />
          Loading…
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}