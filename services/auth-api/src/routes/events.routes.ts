import { FastifyInstance } from 'fastify'
import { db } from '../db'
import { authenticate } from '../middleware/authenticate'

export async function eventsRoutes(app: FastifyInstance) {

  // GET /events — paginated list with filters
  app.get('/events', { preHandler: authenticate }, async (req, reply) => {
    const user     = (req as any).user
    const q        = req.query as any
    const limit    = Math.min(parseInt(q.limit  ?? '50'), 500)
    const offset   = parseInt(q.offset   ?? '0')
    const severity = q.severity
    const search   = q.search
    const source   = q.source
    const from     = q.from   // ISO timestamp
    const to       = q.to     // ISO timestamp

    let sql    = `SELECT id, severity, category, parser_used, confidence,
                         event_time, ingested_at, data, raw
                  FROM events WHERE tenant_id = $1`
    const params: any[] = [user.tenantId]
    let p = 1

    if (severity) { sql += ` AND severity = $${++p}`;           params.push(severity) }
    if (source)   { sql += ` AND data->>'sourceType' = $${++p}`;params.push(source)   }
    if (search)   { sql += ` AND data::text ILIKE $${++p}`;     params.push(`%${search}%`) }
    if (from)     { sql += ` AND event_time >= $${++p}`;        params.push(from) }
    if (to)       { sql += ` AND event_time <= $${++p}`;        params.push(to)   }

    const countSql = sql.replace(
      'SELECT id, severity, category, parser_used, confidence,\n                         event_time, ingested_at, data, raw',
      'SELECT COUNT(*)'
    )

    sql += ` ORDER BY ingested_at DESC LIMIT $${++p} OFFSET $${++p}`
    params.push(limit, offset)

    const [events, total] = await Promise.all([
      db.query(sql, params),
      db.query(countSql, params.slice(0, -2))
    ])

    return reply.send({
      events: events.rows,
      total:  parseInt(total.rows[0].count),
      limit,
      offset
    })
  })

  // GET /events/stats — severity counts for last 24h
  app.get('/events/stats', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user
    const result = await db.query(
      `SELECT severity, COUNT(*) as count
       FROM events
       WHERE tenant_id = $1
       AND ingested_at > NOW() - INTERVAL '24 hours'
       GROUP BY severity ORDER BY count DESC`,
      [user.tenantId]
    )
    return reply.send({ stats: result.rows })
  })

  // GET /events/timeline — events per hour for last 24h
  app.get('/events/timeline', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user
    const result = await db.query(
      `SELECT date_trunc('hour', ingested_at) AS hour,
              COUNT(*) as count
       FROM events
       WHERE tenant_id = $1
       AND ingested_at > NOW() - INTERVAL '24 hours'
       GROUP BY hour ORDER BY hour ASC`,
      [user.tenantId]
    )
    return reply.send({ timeline: result.rows })
  })

  // GET /events/summary — top level numbers
  app.get('/events/summary', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE ingested_at > NOW() - INTERVAL '24 hours') AS total_24h,
         COUNT(*) FILTER (WHERE severity IN ('error','critical') AND ingested_at > NOW() - INTERVAL '24 hours') AS errors_24h,
         COUNT(DISTINCT data->>'source') AS active_sources,
         ROUND(AVG(EXTRACT(EPOCH FROM (ingested_at - event_time)) * 1000)) AS avg_latency_ms
       FROM events WHERE tenant_id = $1`,
      [user.tenantId]
    )
    return reply.send({ summary: result.rows[0] })
  })

  // GET /events/:id — single event detail
  app.get<{ Params: { id: string } }>('/events/:id', { preHandler: authenticate }, async (req, reply) => {
    const user = (req as any).user
    const result = await db.query(
      `SELECT * FROM events WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, user.tenantId]
    )
    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Event not found' })
    }
    return reply.send({ event: result.rows[0] })
  })
}