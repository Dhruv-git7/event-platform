import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import { authRoutes }    from './routes/auth.routes'
import { eventsRoutes }  from './routes/events.routes'
import { apiKeysRoutes } from './routes/apikeys.routes'

const app = Fastify({ logger: true })

const JWT_SECRET = process.env.JWT_SECRET ?? 'super-secret-change-in-production-min-32-chars'

async function start() {

  // Plugins
  await app.register(fastifyCookie)
  await app.register(fastifyJwt, {
    secret: JWT_SECRET,
    cookie: { cookieName: 'accessToken', signed: false }
  })
  await app.register(fastifyCors, {
    origin:      ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
  })

  // Routes
  await app.register(authRoutes)
  await app.register(eventsRoutes)
  await app.register(apiKeysRoutes)

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  await app.listen({ port: 4002, host: '0.0.0.0' })
  console.log('Auth API running on port 4002')
}

start()