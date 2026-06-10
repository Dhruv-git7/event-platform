import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import type { NormalizedEvent } from '../../../packages/types/src/index'

export function useEventStream() {
  const [events, setEvents] = useState<NormalizedEvent[]>([])

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4001')

    socket.on('event', (event: NormalizedEvent) => {
      setEvents(prev => [event, ...prev].slice(0, 500))
    })

    return () => { socket.disconnect() }
  }, [])

  return events
}