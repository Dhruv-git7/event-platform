export interface RawEnvelope {
  id: string
  rawData: string
  sourceType: string
  sourceId: string
  receivedAt: number
  meta: Record<string, unknown>
}

export interface NormalizedEvent {
  id: string
  timestamp: string
  source: {
    type: string
    id: string
    host?: string
  }
  severity: 'debug' | 'info' | 'warn' | 'error' | 'critical' | 'unknown'
  category: string
  tags: string[]
  raw: string
  data: Record<string, unknown>
  meta: {
    parserUsed: string
    confidence: number
  }
}