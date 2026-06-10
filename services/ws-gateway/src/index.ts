import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

const app        = express()
const httpServer = createServer(app)
const io         = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})
const redisSub   = new Redis(REDIS_URL)

redisSub.subscribe('events:all', (err) => {
  if (err) console.error('Redis subscribe error:', err)
  else console.log('Subscribed to events:all')
})

redisSub.on('message', (_channel, message) => {
  io.emit('event', JSON.parse(message))
})

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

httpServer.listen(4001, '0.0.0.0', () => {
  console.log('WS Gateway running on port 4001')
})