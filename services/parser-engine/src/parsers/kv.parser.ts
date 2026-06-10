import type { RawEnvelope } from '../types'

export const kvParser = {
  name: 'kv',
  priority: 3,
  canParse: async (env: RawEnvelope) => /\w+=\S+/.test(env.rawData),
  parse: async (env: RawEnvelope) => {
    const fields: Record<string, string> = {}
    for (const match of env.rawData.matchAll(/(\w+)=([^\s]+)/g)) {
      fields[match[1]] = match[2]
    }
    return { fields, confidence: 0.7, parserUsed: 'kv' }
  }
}