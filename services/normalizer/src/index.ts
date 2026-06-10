import { Kafka } from 'kafkajs'
import { Client as OpenSearchClient } from '@opensearch-project/opensearch'
import Redis from 'ioredis'
import { Pool } from 'pg'
import { v4 as uuid } from 'uuid'
import type { NormalizedEvent } from './types'

const KAFKA_BROKER   = process.env.KAFKA_BROKER   ?? 'localhost:9092'
const REDIS_URL      = process.env.REDIS_URL      ?? 'redis://localhost:6379'
const OPENSEARCH_URL = process.env.OPENSEARCH_URL ?? 'http://localhost:9200'
const PG_URL         = process.env.PG_URL         ?? 'postgresql://platform:platform@localhost:5432/platform'

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

const kafka      = new Kafka({ brokers: [KAFKA_BROKER] })
const consumer   = kafka.consumer({ groupId: 'normalizer-workers' })
const opensearch = new OpenSearchClient({ node: OPENSEARCH_URL })
const redis      = new Redis(REDIS_URL)
const pg         = new Pool({ connectionString: PG_URL })

function mapSeverity(fields: Record<string, unknown>): NormalizedEvent['severity'] {
  const raw = String(fields.level ?? fields.severity ?? fields.priority ?? '').toLowerCase()
  if (['critical', 'fatal', 'emerg', 'alert'].includes(raw)) return 'critical'
  if (['error', 'err', 'crit'].includes(raw))                return 'error'
  if (['warn', 'warning'].includes(raw))                     return 'warn'
  if (['info', 'notice'].includes(raw))                      return 'info'
  if (['debug', 'trace'].includes(raw))                      return 'debug'
  return 'unknown'
}

async function saveToPostgres(event: NormalizedEvent) {
  try {
    await pg.query(
      `INSERT INTO events
        (id, tenant_id, severity, category, parser_used,
         confidence, event_time, ingested_at, data, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9)`,
      [
        event.id,
        DEFAULT_TENANT_ID,
        event.severity,
        event.category,
        event.meta.parserUsed,
        event.meta.confidence,
        event.timestamp,
        JSON.stringify(event.data),
        event.raw
      ]
    )
    console.log(`Postgres saved: ${event.id}`)
  } catch (err) {
    console.error('Postgres save failed:', err)
  }
}

async function saveToOpenSearch(event: NormalizedEvent) {
  try {
    await opensearch.index({ index: 'events', body: event })
  } catch (err) {
    console.error('OpenSearch save failed:', err)
  }
}

async function run() {
  await consumer.connect()
  await consumer.subscribe({ topic: 'parsed-events', fromBeginning: false })

  console.log('Normalizer running — saving to Postgres + OpenSearch + Redis')

  await consumer.run({
    eachMessage: async ({ message }) => {
      const { envelope, result } = JSON.parse(message.value!.toString())

      const event: NormalizedEvent = {
        id:        uuid(),
        timestamp: new Date(envelope.receivedAt).toISOString(),
        source:    { type: envelope.sourceType, id: envelope.sourceId },
        severity:  mapSeverity(result.fields),
        category:  String(result.fields.category ?? 'general'),
        tags:      [],
        raw:       envelope.rawData,
        data:      result.fields,
        meta:      { parserUsed: result.parserUsed, confidence: result.confidence }
      }

      await Promise.allSettled([
        saveToPostgres(event),
        saveToOpenSearch(event),
        redis.publish('events:all', JSON.stringify(event))
      ])
    }
  })
}

run()