import { Kafka } from 'kafkajs'
import { runPipeline } from './pipeline'

const KAFKA_BROKER = process.env.KAFKA_BROKER ?? 'localhost:9092'
const kafka = new Kafka({ brokers: [KAFKA_BROKER] })
const consumer = kafka.consumer({ groupId: 'parser-workers' })
const producer = kafka.producer()

async function run() {
  await consumer.connect()
  await producer.connect()
  await consumer.subscribe({ topic: 'raw-events', fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ message }) => {
      const envelope = JSON.parse(message.value!.toString())
      const result = await runPipeline(envelope)

      await producer.send({
        topic: 'parsed-events',
        messages: [{ value: JSON.stringify({ envelope, result }) }]
      })

      console.log(`Parsed with ${result.parserUsed} (confidence: ${result.confidence})`)
    }
  })
}

run()