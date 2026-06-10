import { Kafka } from 'kafkajs'
import { Client } from '@opensearch-project/opensearch'
import Redis from 'ioredis'
import { v4 as uuid } from 'uuid'
import type { NormalizedEvent } from './types'

const KAFKA_BROKER   = process.env.KAFKA_BROKER    ?? 'localhost:9092'
const REDIS_URL      = process.env.REDIS_URL       ?? 'redis://localhost:6379'
const OPENSEARCH_URL = process.env.OPENSEARCH_URL  ?? 'http://localhost:9200'

const kafka      = new Kafka({ brokers: [KAFKA_BROKER] })
const consumer   = kafka.consumer({ groupId: 'normalizer-workers' })
const opensearch = new Client({ node: OPENSEARCH_URL })
const redis      = new Redis(REDIS_URL)

function mapSeverity(fields: Record<string, unknown>): NormalizedEvent['severity'] {
  const raw = String(fields.level ?? fields.severity ?? fields.priority ?? '').toLowerCase()
  if (['critical', 'fatal', 'emerg', 'alert'].includes(raw)) return 'critical'
  if (['error', 'err', 'crit'].includes(raw))                return 'error'
  if (['warn', 'warning'].includes(raw))                     return 'warn'
  if (['info', 'notice'].includes(raw))                      return 'info'
  if (['debug', 'trace'].includes(raw))                      return 'debug'
  return 'unknown'
}

async function run() {
  await consumer.connect()
  await consumer.subscribe({ topic: 'parsed-events', fromBeginning: false })

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

      // Save to OpenSearch
      await opensearch.index({ index: 'events', body: event })

      // Push to Redis for live dashboard
      await redis.publish('events:all', JSON.stringify(event))

      console.log(`Normalized event ${event.id} — severity: ${event.severity}`)
    }
  })
}

run()