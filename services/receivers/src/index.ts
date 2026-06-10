import Fastify from 'fastify'
import { Kafka } from 'kafkajs'
import { v4 as uuid } from 'uuid'
import { startKafkaReceiver } from './kafka-receiver'

const KAFKA_BROKER = process.env.KAFKA_BROKER ?? 'localhost:9092'

const app = Fastify({ logger: true })
const kafka = new Kafka({ brokers: [KAFKA_BROKER] })
const producer = kafka.producer()

app.post('/ingest', async (req, reply) => {
  const envelope = {
    id: uuid(),
    rawData: JSON.stringify(req.body),
    sourceType: (req.headers['x-source-type'] as string) ?? 'http_webhook',
    sourceId: req.ip,
    receivedAt: Date.now(),
    meta: { headers: req.headers }
  }

  await producer.send({
    topic: 'raw-events',
    messages: [{ key: envelope.id, value: JSON.stringify(envelope) }]
  })

  return reply.status(202).send({ status: 'queued', id: envelope.id })
})

const start = async () => {
  await producer.connect()
  await app.listen({ port: 4000, host: '0.0.0.0' })
  console.log('Receiver running on port 4000')

  // Start Kafka receiver for external topics
  await startKafkaReceiver('external-logs')
  console.log('Kafka receiver started for topic: external-logs')
}

start()
