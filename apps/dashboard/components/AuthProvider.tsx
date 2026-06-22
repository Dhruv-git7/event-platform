'use client'
import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getMe, logoutUser } from '@/lib/api'

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

  // Guards against React StrictMode's double-mount in dev, which otherwise
  // fires getMe() twice in parallel and can resolve in a different order,
  // causing the exact dashboard -> login -> dashboard flicker you're seeing.
  const hasChecked = useRef(false)
  const isMounted  = useRef(true)

  useEffect(() => {
    isMounted.current = true

    if (!hasChecked.current) {
      hasChecked.current = true

      getMe()
        .then((data: unknown) => {
          if (!isMounted.current) return // component unmounted mid-request — do nothing
          const d = data as { user?: AuthUser } | null

          if (d?.user) {
            setUser(d.user)
            // Already logged in but sitting on /login -> bounce to dashboard.
            // Using a plain check here (not router.push from inside render)
            // avoids re-triggering this effect.
            if (pathname === '/login') router.replace('/')
          } else {
            setUser(null)
            if (pathname !== '/login') router.replace('/login')
          }
        })
        .catch(() => {
          if (!isMounted.current) return
          setUser(null)
          if (pathname !== '/login') router.replace('/login')
        })
        .finally(() => {
          if (isMounted.current) setLoading(false)
        })
    }

    return () => {
      isMounted.current = false
    }
    // Intentionally empty deps — this must run exactly once per real mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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