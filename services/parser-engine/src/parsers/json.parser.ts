import type { RawEnvelope } from '../types'

export const jsonParser = {
  name: 'json',
  priority: 1,
  canParse: async (env: RawEnvelope) => {
    try { JSON.parse(env.rawData); return true } catch { return false }
  },
  parse: async (env: RawEnvelope) => ({
    fields: JSON.parse(env.rawData),
    confidence: 1.0,
    parserUsed: 'json'
  })
}