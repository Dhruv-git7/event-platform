'use client'
import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

interface NormalizedEvent {
  id: string
  timestamp: string
  source: { type: string; id: string }
  severity: string
  category: string
  tags: string[]
  raw: string
  data: Record<string, unknown>
  meta: { parserUsed: string; confidence: number }
}

const severityColor: Record<string, string> = {
  error:    'bg-red-900 text-red-300 border-red-700',
  warn:     'bg-yellow-900 text-yellow-300 border-yellow-700',
  info:     'bg-blue-900 text-blue-300 border-blue-700',
  debug:    'bg-gray-800 text-gray-400 border-gray-600',
  critical: 'bg-red-950 text-red-200 border-red-600',
  unknown:  'bg-gray-800 text-gray-500 border-gray-600',
}

const severityBadge: Record<string, string> = {
  error:    'bg-red-500 text-white',
  warn:     'bg-yellow-500 text-black',
  info:     'bg-blue-500 text-white',
  debug:    'bg-gray-500 text-white',
  critical: 'bg-red-700 text-white',
  unknown:  'bg-gray-600 text-white',
}

export default function Dashboard() {
  const [events, setEvents] = useState<NormalizedEvent[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io('http://localhost:4001')

    socket.on('connect', () => {
      setConnected(true)
      console.log('Connected to WS gateway')
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('event', (event: NormalizedEvent) => {
      setEvents(prev => [event, ...prev].slice(0, 500))
    })

    return () => { socket.disconnect() }
  }, [])

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 font-mono">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Event Platform
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Universal Real-Time Event Stream
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-400">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <span className="text-sm text-gray-500">
            {events.length} events
          </span>
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-3">
        {events.length === 0 && (
          <div className="text-center py-20 text-gray-600">
            <p className="text-4xl mb-4">⏳</p>
            <p className="text-lg">Waiting for events...</p>
            <p className="text-sm mt-2">
              POST to http://localhost:4000/ingest to send an event
            </p>
          </div>
        )}

        {events.map(event => (
          <div
            key={event.id}
            className={`border rounded-lg p-4 ${severityColor[event.severity] ?? severityColor.unknown}`}
          >
            {/* Event header */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${severityBadge[event.severity] ?? severityBadge.unknown}`}>
                {event.severity.toUpperCase()}
              </span>
              <span className="text-xs text-purple-400 font-semibold">
                {event.source.type}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-xs text-gray-500">
                parser: {event.meta.parserUsed}
              </span>
              <span className="text-xs text-gray-500">
                confidence: {Math.round(event.meta.confidence * 100)}%
              </span>
            </div>

            {/* Dynamic fields */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              {Object.entries(event.data).map(([key, value]) => (
                <div key={key} className="flex gap-2 items-baseline">
                  <span className="text-cyan-400 shrink-0 text-xs">
                    {key}
                  </span>
                  <span className="text-gray-200 truncate">
                    {String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}