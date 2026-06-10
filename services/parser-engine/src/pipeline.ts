import type { RawEnvelope } from './types'
import { jsonParser } from './parsers/json.parser'
import { kvParser } from './parsers/kv.parser'

const parsers = [jsonParser, kvParser].sort((a, b) => a.priority - b.priority)

export async function runPipeline(envelope: RawEnvelope) {
  for (const parser of parsers) {
    if (await parser.canParse(envelope)) {
      return parser.parse(envelope)
    }
  }
  return {
    fields: { message: envelope.rawData },
    confidence: 0.1,
    parserUsed: 'fallback'
  }
}