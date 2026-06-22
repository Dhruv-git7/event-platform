import { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db'
import crypto from 'crypto'

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    // Check API key first
    const apiKey = req.headers['x-api-key'] as string
    if (apiKey) {
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
      const result = await db.query(
        `SELECT ak.*, t.id as tenant_id
         FROM api_keys ak
         JOIN tenants t ON t.id = ak.tenant_id
         WHERE ak.key_hash = $1
         AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
        [keyHash]
      )
      if (result.rows.length > 0) {
        const key = result.rows[0]
        ;(req as any).user = {
          userId: key.created_by,
          tenantId: key.tenant_id,
          role: 'api',
          scopes: key.scopes
        }
        return
      }
    }

    // Check JWT cookie
    await req.jwtVerify()
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' })
  }
}