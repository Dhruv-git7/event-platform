'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginUser } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode]         = useState<'login' | 'signup'>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields'); return }
    setLoading(true)
    setError('')
    try {
      await loginUser(email.trim(), password)
      router.push('/')
    } catch {
      setError('Incorrect email or password')
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async () => {
    if (!name || !email || !password) { setError('Please fill in all fields'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('http://localhost:4002/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email: email.trim(), password })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Registration failed')
      }
      // Auto-login after signup
      await loginUser(email.trim(), password)
      router.push('/')
    } catch (err: any) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f5f5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        background: '#ffffff',
        border: '1px solid #e0e0e0',
        borderRadius: '6px',
        padding: '40px',
        width: '100%',
        maxWidth: '380px',
      }}>
        {/* Title */}
        <h1 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: '600', color: '#111' }}>
          Event Platform
        </h1>
        <p style={{ margin: '0 0 28px 0', fontSize: '14px', color: '#666' }}>
          Universal real-time event monitoring
        </p>

        {/* Mode tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: '24px' }}>
          {(['login', 'signup'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError('') }}
              style={{
                flex: 1,
                padding: '8px 0',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: mode === m ? '600' : '400',
                color: mode === m ? '#111' : '#888',
                borderBottom: mode === m ? '2px solid #111' : '2px solid transparent',
                marginBottom: '-1px',
              }}>
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: '#fff0f0',
            border: '1px solid #e0b0b0',
            borderRadius: '4px',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#c00'
          }}>
            {error}
          </div>
        )}

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {mode === 'signup' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#444', marginBottom: '5px' }}>
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#444', marginBottom: '5px' }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#444', marginBottom: '5px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Minimum 8 characters' : 'Your password'}
              onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleSignup())}
              style={inputStyle}
            />
          </div>

          <button
            onClick={mode === 'login' ? handleLogin : handleSignup}
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              background: loading ? '#888' : '#111',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '4px',
            }}>
            {loading
              ? 'Please wait...'
              : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </div>

        {/* Default credentials hint */}
        {mode === 'login' && (
          <p style={{ marginTop: '20px', fontSize: '12px', color: '#aaa', textAlign: 'center' }}>
            Default admin: admin@platform.local
          </p>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #d0d0d0',
  borderRadius: '4px',
  fontSize: '14px',
  color: '#111',
  background: '#fff',
  boxSizing: 'border-box',
  outline: 'none',
}