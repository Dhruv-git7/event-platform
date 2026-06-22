import { FastifyInstance } from 'fastify'
import { db } from '../db'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import crypto from 'crypto'
import type { LoginBody } from '../types'

export async function authRoutes(app: FastifyInstance) {

  // POST /auth/login
  app.post<{ Body: LoginBody }>('/auth/login', async (req, reply) => {
    const { email, password } = req.body

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password required' })
    }

    // Find user
    const result = await db.query(
      `SELECT u.*, t.slug as tenant_slug
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND u.is_active = true`,
      [email.toLowerCase().trim()]
    )

    if (result.rows.length === 0) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const user = result.rows[0]

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    // Generate JWT
    const payload = {
      userId:   user.id,
      tenantId: user.tenant_id,
      email:    user.email,
      role:     user.role
    }

    const accessToken  = app.jwt.sign(payload, { expiresIn: '15m' })
    const refreshToken = app.jwt.sign({ userId: user.id }, { expiresIn: '7d' })

    // Store refresh token in DB
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await db.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [uuid(), user.id, tokenHash, expiresAt]
    )

    // Update last login
    await db.query(
      `UPDATE users SET last_login = NOW() WHERE id = $1`,
      [user.id]
    )

    // Set httpOnly cookie
    reply.setCookie('accessToken', accessToken, {
      httpOnly: true,
      secure:   false,
      sameSite: 'lax',
      path:     '/',
      maxAge:   15 * 60
    })

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure:   false,
      sameSite: 'lax',
      path:     '/auth/refresh',
      maxAge:   7 * 24 * 60 * 60
    })

    return reply.send({
      user: {
        id:       user.id,
        email:    user.email,
        role:     user.role,
        tenantId: user.tenant_id
      }
    })
  })

  // POST /auth/register — create a new user under the default tenant
app.post<{ Body: { name: string; email: string; password: string } }>(
  '/auth/register',
  async (req, reply) => {
    const { name, email, password } = req.body

    if (!email || !password || !name) {
      return reply.status(400).send({ error: 'Name, email and password are required' })
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' })
    }

    // Check if email already exists
    const existing = await db.query(
      `SELECT id FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    )
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: 'An account with this email already exists' })
    }

    const hash = await bcrypt.hash(password, 10)
    const result = await db.query(
      `INSERT INTO users (tenant_id, email, password_hash, role)
       VALUES ($1, $2, $3, 'viewer')
       RETURNING id, email, role`,
      ['00000000-0000-0000-0000-000000000001', email.toLowerCase().trim(), hash]
    )

    return reply.status(201).send({ user: result.rows[0] })
  }
)

  // POST /auth/refresh
  app.post('/auth/refresh', async (req, reply) => {
    const refreshToken = req.cookies?.refreshToken
    if (!refreshToken) {
      return reply.status(401).send({ error: 'No refresh token' })
    }

    try {
      const decoded = app.jwt.verify(refreshToken) as { userId: string }
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')

      const session = await db.query(
        `SELECT * FROM sessions
         WHERE token_hash = $1 AND expires_at > NOW()`,
        [tokenHash]
      )

      if (session.rows.length === 0) {
        return reply.status(401).send({ error: 'Session expired' })
      }

      const userResult = await db.query(
        `SELECT * FROM users WHERE id = $1`,
        [decoded.userId]
      )

      if (userResult.rows.length === 0) {
        return reply.status(401).send({ error: 'User not found' })
      }

      const user = userResult.rows[0]
      const newAccessToken = app.jwt.sign({
        userId:   user.id,
        tenantId: user.tenant_id,
        email:    user.email,
        role:     user.role
      }, { expiresIn: '15m' })

      reply.setCookie('accessToken', newAccessToken, {
        httpOnly: true,
        secure:   false,
        sameSite: 'lax',
        path:     '/',
        maxAge:   15 * 60
      })

      return reply.send({ message: 'Token refreshed' })
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' })
    }
  })

  // POST /auth/logout
  app.post('/auth/logout', async (req, reply) => {
    const refreshToken = req.cookies?.refreshToken
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
      await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash])
    }

    reply.clearCookie('accessToken')
    reply.clearCookie('refreshToken')
    return reply.send({ message: 'Logged out' })
  })

  // GET /auth/me
  app.get('/auth/me', {
    preHandler: async (req, reply) => {
      try { await req.jwtVerify() }
      catch { reply.status(401).send({ error: 'Unauthorized' }) }
    }
  }, async (req, reply) => {
    const payload = req.user as any
    const result = await db.query(
      `SELECT id, email, role, tenant_id, created_at FROM users WHERE id = $1`,
      [payload.userId]
    )
    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'User not found' })
    }
    return reply.send({ user: result.rows[0] })
  })
}