import { Kafka } from 'kafkajs'
import { v4 as uuid } from 'uuid'

const kafka = new Kafka({ brokers: ['localhost:9092'] })
const internalProducer = kafka.producer()

// This consumes from an EXTERNAL topic and feeds your pipeline
const externalConsumer = kafka.consumer({ groupId: 'kafka-receiver' })

export async function startKafkaReceiver(externalTopic: string) {
  await internalProducer.connect()
  await externalConsumer.connect()
  await externalConsumer.subscribe({ topic: externalTopic, fromBeginning: false })

await externalConsumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const envelope = {
        id: uuid(),
        rawData: message.value?.toString() ?? '',
        sourceType: 'kafka',
        sourceId: `kafka-topic:${externalTopic}`,
        receivedAt: Date.now(),
        meta: {
          topic: topic,
          partition: partition,
          offset: message.offset?.toString()
        }
      }

      await internalProducer.send({
        topic: 'raw-events',
        messages: [{ key: envelope.id, value: JSON.stringify(envelope) }]
      })

      console.log(`Kafka receiver: forwarded message from ${externalTopic}`)
    }
  })
}