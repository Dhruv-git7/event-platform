import { FastifyInstance } from 'fastify'
import { db } from '../db'
import { authenticate } from '../middleware/authenticate'
import { v4 as uuid } from 'uuid'
import crypto from 'crypto'

export async function apiKeysRoutes(app: FastifyInstance) {

  // POST /api-keys — create a new API key
  app.post('/api-keys', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user
    const body = req.body as any

    // Generate a random key
    const rawKey  = `ep_${crypto.randomBytes(32).toString('hex')}`
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

    await db.query(
      `INSERT INTO api_keys (id, tenant_id, created_by, key_hash, name, scopes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuid(), user.tenantId, user.userId, keyHash, body.name ?? 'My API Key', body.scopes ?? ['read']]
    )

    // Return raw key ONCE — never stored again
    return reply.status(201).send({
      key:     rawKey,
      message: 'Save this key — it will not be shown again'
    })
  })

  // GET /api-keys — list keys (no raw key values)
  app.get('/api-keys', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user
    const result = await db.query(
      `SELECT id, name, scopes, expires_at, created_at
       FROM api_keys WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [user.tenantId]
    )
    return reply.send({ keys: result.rows })
  })

  // DELETE /api-keys/:id
  app.delete<{ Params: { id: string } }>('/api-keys/:id', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user
    await db.query(
      `DELETE FROM api_keys WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, user.tenantId]
    )
    return reply.send({ message: 'API key deleted' })
  })
}