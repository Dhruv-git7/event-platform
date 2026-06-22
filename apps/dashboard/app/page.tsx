'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from '../components/AuthProvider'
import { getStats, getTimeline, getSummary, getEvents } from '../lib/api'

interface NormalizedEvent {
  id: string
  timestamp?: string
  event_time?: string
  ingested_at?: string
  source?: { type: string; id: string }
  severity: string
  category: string
  data: Record<string, unknown>
  meta?: { parserUsed: string; confidence: number }
  parser_used?: string
  confidence?: number
}

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-red-950 text-red-200 border-red-800',
  error:    'bg-red-900 text-red-300 border-red-700',
  warn:     'bg-yellow-900 text-yellow-300 border-yellow-700',
  info:     'bg-blue-900 text-blue-300 border-blue-700',
  debug:    'bg-gray-800 text-gray-400 border-gray-700',
  unknown:  'bg-gray-800 text-gray-500 border-gray-700',
}

const SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-700 text-white',
  error:    'bg-red-500 text-white',
  warn:     'bg-yellow-500 text-black',
  info:     'bg-blue-500 text-white',
  debug:    'bg-gray-600 text-white',
  unknown:  'bg-gray-700 text-gray-300',
}

const SEV_DOT: Record<string, string> = {
  critical: 'bg-red-700',
  error:    'bg-red-500',
  warn:     'bg-yellow-500',
  info:     'bg-blue-500',
  debug:    'bg-gray-500',
  unknown:  'bg-gray-600',
}

export default function Dashboard() {
  const { user, logout }     = useAuth()
  const [tab, setTab]        = useState<'live' | 'search'>('live')
  const [liveEvents, setLiveEvents]   = useState<NormalizedEvent[]>([])
  const [connected,  setConnected]    = useState(false)
  const [search,     setSearch]       = useState('')
  const [sevFilter,  setSevFilter]    = useState('')
  const [histEvents, setHistEvents]   = useState<NormalizedEvent[]>([])
  const [histTotal,  setHistTotal]    = useState(0)
  const [histPage,   setHistPage]     = useState(0)
  const [histLoading,setHistLoading]  = useState(false)
  const [stats,      setStats]        = useState<{severity:string,count:string}[]>([])
  const [timeline,   setTimeline]     = useState<{hour:string,count:string}[]>([])
  const [summary,    setSummary]      = useState<any>({})
  const [selected,   setSelected]     = useState<NormalizedEvent | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const LIMIT = 50

  // Live socket
  useEffect(() => {
    const s = io('http://localhost:4001')
    socketRef.current = s
    s.on('connect',    () => setConnected(true))
    s.on('disconnect', () => setConnected(false))
    s.on('event', (ev: NormalizedEvent) =>
      setLiveEvents(prev => [ev, ...prev].slice(0, 500))
    )
    return () => { s.disconnect() }
  }, [])

  // Analytics
  useEffect(() => {
    getStats().then(d => d && setStats(d.stats ?? []))
    getTimeline().then(d => d && setTimeline(d.timeline ?? []))
    getSummary().then(d => d && setSummary(d.summary ?? {}))
    const interval = setInterval(() => {
      getStats().then(d => d && setStats(d.stats ?? []))
      getSummary().then(d => d && setSummary(d.summary ?? {}))
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Historical search
  const fetchHistory = useCallback(async (page = 0, sev = sevFilter, q = search) => {
    setHistLoading(true)
    try {
      const data = await getEvents({
        limit: LIMIT, offset: page * LIMIT,
        ...(sev && { severity: sev }),
        ...(q   && { search: q })
      })
      if (data) { setHistEvents(data.events); setHistTotal(data.total) }
    } finally {
      setHistLoading(false)
    }
  }, [sevFilter, search])

  useEffect(() => {
    if (tab === 'search') fetchHistory(0)
  }, [tab])

  const handleSearch = () => { setHistPage(0); fetchHistory(0, sevFilter, search) }
  const handleSevFilter = (s: string) => {
    setSevFilter(s)
    if (tab === 'live') setTab('search')
    setHistPage(0); fetchHistory(0, s, search)
  }
  const handlePage = (p: number) => { setHistPage(p); fetchHistory(p) }

  const maxCount = Math.max(...timeline.map(t => parseInt(t.count) || 0), 1)
  const totalStats = stats.reduce((a, s) => a + parseInt(s.count), 0) || 1

  const displayEvents = tab === 'live' ? liveEvents : histEvents

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-4 font-mono text-sm">

      {/* Top bar */}
      <div className="flex items-center gap-3 mb-4 bg-gray-900 border border-gray-800 rounded-xl p-3">
        <span className="text-white font-bold text-base shrink-0">Event Platform</span>
        <div className="flex-1 flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
          <span className="text-gray-500 text-xs">🔍</span>
          <input
            className="bg-transparent outline-none text-gray-200 text-xs w-full placeholder-gray-600"
            placeholder="Search events — type keyword and press Enter"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          {search && (
            <button onClick={() => { setSearch(''); fetchHistory(0, sevFilter, '') }}
              className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
          )}
        </div>
        <button onClick={handleSearch}
          className="bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs shrink-0">
          Search
        </button>
        <div className="flex items-center gap-2 border-l border-gray-700 pl-3 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`}/>
          <span className="text-xs text-gray-400">{connected ? 'Live' : 'Offline'}</span>
          {user && <>
            <span className="text-xs text-gray-500 hidden md:block">{user.email}</span>
            <span className="text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded">{user.role}</span>
            <button onClick={logout} className="text-xs text-gray-600 hover:text-red-400">Logout</button>
          </>}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total events (24h)', value: parseInt(summary.total_24h ?? 0).toLocaleString(), sub: 'ingested' },
          { label: 'Errors + Critical',  value: parseInt(summary.errors_24h ?? 0).toLocaleString(), sub: 'last 24h', red: true },
          { label: 'Avg latency',        value: `${Math.round(summary.avg_latency_ms ?? 0)}ms`, sub: 'ingest pipeline' },
          { label: 'Live events',        value: liveEvents.length.toString(), sub: 'this session' },
        ].map(c => (
          <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <div className="text-gray-500 text-xs mb-1">{c.label}</div>
            <div className={`text-2xl font-bold ${c.red ? 'text-red-400' : 'text-white'}`}>{c.value}</div>
            <div className="text-gray-600 text-xs mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-3 mb-4">

        {/* Timeline chart */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-gray-500 text-xs uppercase tracking-wider mb-3">Events / hour (24h)</div>
          <div className="flex items-end gap-1 h-20">
            {timeline.length === 0
              ? <div className="text-gray-700 text-xs w-full text-center pt-8">No data yet — send some events</div>
              : timeline.map((t, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-blue-600 rounded-sm min-h-[2px]"
                    style={{ height: `${(parseInt(t.count) / maxCount) * 100}%` }}
                    title={`${t.count} events`}
                  />
                </div>
              ))
            }
          </div>
        </div>

        {/* Severity breakdown */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-gray-500 text-xs uppercase tracking-wider mb-3">By severity (24h)</div>
          <div className="space-y-2">
            {stats.length === 0
              ? <div className="text-gray-700 text-xs pt-4 text-center">No data yet</div>
              : stats.map(s => (
                <div key={s.severity} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${SEV_DOT[s.severity] ?? 'bg-gray-600'}`}/>
                  <span className="text-gray-400 text-xs w-14 shrink-0">{s.severity}</span>
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(parseInt(s.count) / totalStats) * 100}%` }}
                    />
                  </div>
                  <span className="text-gray-300 text-xs w-8 text-right">{s.count}</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Events panel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

        {/* Tabs + filters */}
        <div className="flex items-center gap-1 border-b border-gray-800 px-4 pt-2">
          {(['live', 'search'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-purple-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {t === 'live' ? `Live stream (${liveEvents.length})` : `Search history (${histTotal})`}
            </button>
          ))}
          <div className="flex-1"/>
          <div className="flex gap-1 pb-2">
            {['', 'critical', 'error', 'warn', 'info', 'debug'].map(s => (
              <button key={s} onClick={() => handleSevFilter(s)}
                className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                  sevFilter === s
                    ? 'bg-purple-900 border-purple-700 text-purple-300'
                    : 'border-gray-700 text-gray-500 hover:text-gray-300'
                }`}>
                {s || 'all'}
              </button>
            ))}
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-950 text-gray-600 text-xs uppercase tracking-wider">
          <span className="col-span-2">Severity</span>
          <span className="col-span-2">Source</span>
          <span className="col-span-2">Time</span>
          <span className="col-span-4">Fields</span>
          <span className="col-span-2">Parser</span>
        </div>

        {/* Event rows */}
        <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
          {displayEvents.length === 0 && (
            <div className="text-center py-16 text-gray-700">
              {tab === 'live'
                ? 'Waiting for events — POST to http://localhost:4000/ingest'
                : histLoading ? 'Loading...' : 'No events found'
              }
            </div>
          )}
          {displayEvents.map(ev => (
            <div key={ev.id}
              onClick={() => setSelected(selected?.id === ev.id ? null : ev)}
              className={`grid grid-cols-12 gap-2 px-4 py-2.5 cursor-pointer transition-colors hover:bg-gray-800 ${
                selected?.id === ev.id ? 'bg-gray-800' : ''
              }`}>
              <span className="col-span-2">
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${SEV_BADGE[ev.severity] ?? SEV_BADGE.unknown}`}>
                  {ev.severity.toUpperCase()}
                </span>
              </span>
              <span className="col-span-2 text-purple-400 text-xs truncate">
                {ev.source?.type ?? (ev.data as any)?.sourceType ?? '—'}
              </span>
              <span className="col-span-2 text-gray-500 text-xs">
                {new Date(ev.timestamp ?? ev.ingested_at ?? '').toLocaleTimeString()}
              </span>
              <span className="col-span-4 text-gray-300 text-xs truncate">
                {Object.entries(ev.data).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join('  ·  ')}
              </span>
              <span className="col-span-2 text-gray-600 text-xs">
                {ev.meta?.parserUsed ?? ev.parser_used} {Math.round((ev.meta?.confidence ?? ev.confidence ?? 0) * 100)}%
              </span>

              {/* Expanded detail */}
              {selected?.id === ev.id && (
                <div className="col-span-12 mt-2 bg-gray-950 rounded-lg p-3 border border-gray-700">
                  <div className="text-gray-500 text-xs uppercase tracking-wider mb-2">All fields</div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    {Object.entries(ev.data).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-xs">
                        <span className="text-cyan-500 shrink-0">{k}</span>
                        <span className="text-gray-300 truncate">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-gray-800 text-gray-600 text-xs">
                    ID: {ev.id}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pagination — only show on search tab */}
        {tab === 'search' && histTotal > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 text-xs text-gray-500">
            <span>
              Showing {histPage * LIMIT + 1}–{Math.min((histPage + 1) * LIMIT, histTotal)} of {histTotal.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                disabled={histPage === 0}
                onClick={() => handlePage(histPage - 1)}
                className="px-3 py-1 border border-gray-700 rounded disabled:opacity-30 hover:bg-gray-800">
                ← Prev
              </button>
              <span className="px-3 py-1">{histPage + 1}</span>
              <button
                disabled={(histPage + 1) * LIMIT >= histTotal}
                onClick={() => handlePage(histPage + 1)}
                className="px-3 py-1 border border-gray-700 rounded disabled:opacity-30 hover:bg-gray-800">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}