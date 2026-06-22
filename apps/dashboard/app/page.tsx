'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from '@/components/AuthProvider'
import { getEvents, getStats, getTimeline, getSummary } from '@/lib/api'

// ── Types ────────────────────────────────────────────────────────────────────

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

interface StatsRow   { severity: string; count: string }
interface Timeline   { hour: string; count: string }

// ── Style helpers ─────────────────────────────────────────────────────────────

const SEV_BADGE: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#7f1d1d', text: '#fca5a5' },
  error:    { bg: '#991b1b', text: '#fecaca' },
  warn:     { bg: '#78350f', text: '#fcd34d' },
  info:     { bg: '#1e3a5f', text: '#93c5fd' },
  debug:    { bg: '#1f2937', text: '#9ca3af' },
  unknown:  { bg: '#1f2937', text: '#6b7280' },
}

const SEV_ROW: Record<string, string> = {
  critical: '#2d0808',
  error:    '#2d1010',
  warn:     '#2d1f08',
  info:     '#0a1929',
  debug:    '#111827',
  unknown:  '#111827',
}

const SEV_BAR: Record<string, string> = {
  critical: '#ef4444',
  error:    '#f87171',
  warn:     '#fbbf24',
  info:     '#60a5fa',
  debug:    '#6b7280',
  unknown:  '#374151',
}

const SEVERITIES = ['all', 'critical', 'error', 'warn', 'info', 'debug']

function Badge({ sev }: { sev: string }) {
  const s = SEV_BADGE[sev] ?? SEV_BADGE.unknown
  return (
    <span style={{
      background: s.bg, color: s.text,
      padding: '2px 8px', borderRadius: '4px',
      fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
      textTransform: 'uppercase', whiteSpace: 'nowrap'
    }}>
      {sev}
    </span>
  )
}

function sourceTag(ev: NormalizedEvent) {
  return ev.source?.type ?? (ev.data as any)?.sourceType ?? 'unknown'
}

function eventTime(ev: NormalizedEvent) {
  const t = ev.timestamp ?? ev.ingested_at ?? ev.event_time
  if (!t) return '—'
  return new Date(t).toLocaleTimeString()
}

function parserLabel(ev: NormalizedEvent) {
  const p = ev.meta?.parserUsed ?? ev.parser_used ?? '—'
  const c = ev.meta?.confidence ?? ev.confidence
  return c != null ? `${p} · ${Math.round(c * 100)}%` : p
}

// ── Main component ────────────────────────────────────────────────────────────

const LIMIT = 50
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4001'

export default function Dashboard() {
  const { user, logout } = useAuth()

  // ── Live stream state ──────────────────────────────────────────────────────
  const [liveEvents, setLiveEvents]   = useState<NormalizedEvent[]>([])
  const [connected,  setConnected]    = useState(false)
  const socketRef = useRef<Socket | null>(null)

  // ── Search / history state ─────────────────────────────────────────────────
  const [tab,         setTab]         = useState<'live' | 'search'>('live')
  const [searchInput, setSearchInput] = useState('')   // what user is typing
  const [activeSearch, setActiveSearch] = useState('') // last submitted search
  const [activeSev,   setActiveSev]   = useState('')   // current severity filter
  const [histEvents,  setHistEvents]  = useState<NormalizedEvent[]>([])
  const [histTotal,   setHistTotal]   = useState(0)
  const [histPage,    setHistPage]    = useState(0)
  const [histLoading, setHistLoading] = useState(false)
  const [histError,   setHistError]   = useState('')

  // ── Analytics state ────────────────────────────────────────────────────────
  const [stats,   setStats]   = useState<StatsRow[]>([])
  const [timeline, setTimeline] = useState<Timeline[]>([])
  const [summary, setSummary] = useState<any>({})

  // ── Expanded event ──────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<string | null>(null)

  // ── Socket.io ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = io(WS_URL, { transports: ['websocket', 'polling'] })
    socketRef.current = s
    s.on('connect',    () => setConnected(true))
    s.on('disconnect', () => setConnected(false))
    s.on('event', (ev: NormalizedEvent) => {
      setLiveEvents(prev => [ev, ...prev].slice(0, 1000))
    })
    return () => { s.disconnect() }
  }, [])

  // ── Load recent events from DB on mount so refresh doesn't lose history ────
  useEffect(() => {
    getEvents({ limit: 100, offset: 0 }).then(data => {
      if (data?.events && data.events.length > 0) {
        // Only pre-populate live tab if it's currently empty
        setLiveEvents(prev => {
          if (prev.length > 0) return prev  // new events already arrived, don't overwrite
          return data.events
        })
      }
    }).catch(() => {})  // fail silently — live stream still works
  }, [])

  // ── Analytics (load on mount, refresh every 30s) ──────────────────────────
  useEffect(() => {
    const load = () => {
      getStats().then(d => d && setStats(d.stats ?? []))
      getTimeline().then(d => d && setTimeline(d.timeline ?? []))
      getSummary().then(d => d && setSummary(d.summary ?? {}))
    }
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  // ── Core fetch function — takes explicit values, no stale closures ─────────
  const fetchHistory = useCallback(async (
    page: number,
    sev: string,
    query: string
  ) => {
    setHistLoading(true)
    setHistError('')
    try {
      const data = await getEvents({
        limit:    LIMIT,
        offset:   page * LIMIT,
        severity: sev   || undefined,
        search:   query || undefined,
      })
      if (data) {
        setHistEvents(data.events ?? [])
        setHistTotal(data.total ?? 0)
        setHistPage(page)
      }
    } catch (err: any) {
      setHistError(err?.message ?? 'Failed to load events')
      setHistEvents([])
      setHistTotal(0)
    } finally {
      setHistLoading(false)
    }
  }, [])   // no deps — all values passed explicitly

  // ── Load history when switching to search tab ─────────────────────────────
  useEffect(() => {
    if (tab === 'search') {
      fetchHistory(0, activeSev, activeSearch)
    }
  }, [tab])   // intentionally only on tab change

  // ── Search submit ─────────────────────────────────────────────────────────
  const handleSearch = () => {
    const q = searchInput.trim()
    setActiveSearch(q)
    setTab('search')
    fetchHistory(0, activeSev, q)
  }

  const handleClearSearch = () => {
    setSearchInput('')
    setActiveSearch('')
    fetchHistory(0, activeSev, '')
  }

  // ── Severity filter ───────────────────────────────────────────────────────
  const handleSevFilter = (sev: string) => {
    const newSev = sev === 'all' ? '' : sev
    setActiveSev(newSev)
    setTab('search')
    // Pass new sev directly — don't rely on state update having propagated
    fetchHistory(0, newSev, activeSearch)
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const handlePage = (p: number) => {
    fetchHistory(p, activeSev, activeSearch)
  }

  // ── Chart helpers ─────────────────────────────────────────────────────────
  const maxBar = Math.max(...timeline.map(t => parseInt(t.count) || 0), 1)
  const totalSev = stats.reduce((a, s) => a + parseInt(s.count), 0) || 1

  const displayEvents = tab === 'live' ? liveEvents : histEvents

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f1f5f9', fontFamily: 'ui-monospace, "Courier New", monospace', fontSize: '13px' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap' }}>Event Platform</span>

        {/* Search bar */}
        <div style={{ flex: 1, display: 'flex', gap: '6px' }}>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
            placeholder="Search across all event fields — press Enter or click Search"
            style={{
              flex: 1, padding: '7px 12px', background: '#1e293b',
              border: '1px solid #334155', borderRadius: '5px',
              color: '#f1f5f9', fontSize: '13px', outline: 'none', fontFamily: 'inherit'
            }}
          />
          <button onClick={handleSearch}
            style={{ padding: '7px 16px', background: '#6d28d9', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
            Search
          </button>
          {activeSearch && (
            <button onClick={handleClearSearch}
              style={{ padding: '7px 12px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}>
              Clear
            </button>
          )}
        </div>

        {/* Connection + user */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#94a3b8' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
            {connected ? 'Live' : 'Offline'}
          </span>
          {user && (
            <>
              <span style={{ color: '#64748b', fontSize: '12px' }}>{user.email}</span>
              <span style={{ background: '#4c1d95', color: '#c4b5fd', padding: '2px 7px', borderRadius: '4px', fontSize: '11px' }}>{user.role}</span>
              <button onClick={logout}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px', padding: '2px 4px' }}>
                Logout
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* ── STAT CARDS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {[
            { label: 'Total events (24h)',   value: parseInt(summary.total_24h ?? 0).toLocaleString(),             sub: 'ingested' },
            { label: 'Errors + Critical',    value: parseInt(summary.errors_24h ?? 0).toLocaleString(),            sub: 'last 24h', red: true },
            { label: 'Avg latency',          value: `${Math.max(0, Math.round(summary.avg_latency_ms ?? 0))}ms`,  sub: 'pipeline' },
            { label: 'Live this session',    value: liveEvents.length.toString(),                                  sub: 'events' },
          ].map(card => (
            <div key={card.label} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px 16px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: card.red ? '#f87171' : '#f8fafc' }}>{card.value}</div>
              <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* ── CHARTS ROW ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>

          {/* Timeline */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Events per hour (24h)</div>
            {timeline.length === 0 ? (
              <div style={{ height: '72px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: '12px' }}>No data yet — send some events</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '72px' }}>
                {timeline.map((t, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <div title={`${t.count} events`}
                      style={{ width: '100%', background: '#3b82f6', borderRadius: '2px 2px 0 0', minHeight: '2px', height: `${Math.round((parseInt(t.count) / maxBar) * 100)}%` }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Severity breakdown */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>By severity (24h)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {stats.length === 0 ? (
                <div style={{ color: '#334155', fontSize: '12px', paddingTop: '8px' }}>No data yet</div>
              ) : (
                stats.map(s => (
                  <div key={s.severity} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: SEV_BAR[s.severity] ?? '#374151', flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: '#94a3b8', width: '52px' }}>{s.severity}</span>
                    <div style={{ flex: 1, height: '5px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: SEV_BAR[s.severity] ?? '#374151', borderRadius: '3px', width: `${Math.round((parseInt(s.count) / totalSev) * 100)}%` }} />
                    </div>
                    <span style={{ fontSize: '11px', color: '#e2e8f0', minWidth: '24px', textAlign: 'right' }}>{s.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── EVENTS PANEL ── */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', overflow: 'hidden' }}>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', padding: '0 16px' }}>
            <button onClick={() => setTab('live')}
              style={{ padding: '10px 16px', background: 'none', border: 'none', borderBottom: tab === 'live' ? '2px solid #a78bfa' : '2px solid transparent', color: tab === 'live' ? '#f8fafc' : '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: tab === 'live' ? 600 : 400, marginBottom: '-1px' }}>
              Live stream ({liveEvents.length})
            </button>
            <button onClick={() => { setTab('search'); fetchHistory(0, activeSev, activeSearch) }}
              style={{ padding: '10px 16px', background: 'none', border: 'none', borderBottom: tab === 'search' ? '2px solid #a78bfa' : '2px solid transparent', color: tab === 'search' ? '#f8fafc' : '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: tab === 'search' ? 600 : 400, marginBottom: '-1px' }}>
              Search history {tab === 'search' && `(${histTotal})`}
            </button>
          </div>

          {/* Filter bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderBottom: '1px solid #1e293b', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#64748b', marginRight: '4px' }}>Severity:</span>
            {SEVERITIES.map(sev => {
              const isActive = sev === 'all' ? activeSev === '' : activeSev === sev
              return (
                <button key={sev} onClick={() => handleSevFilter(sev)}
                  style={{
                    padding: '3px 10px', border: `1px solid ${isActive ? '#7c3aed' : '#334155'}`,
                    borderRadius: '20px', background: isActive ? '#4c1d95' : 'transparent',
                    color: isActive ? '#c4b5fd' : '#64748b', cursor: 'pointer', fontSize: '12px',
                    fontFamily: 'inherit'
                  }}>
                  {sev}
                </button>
              )
            })}
            {(activeSev || activeSearch) && (
              <button onClick={() => { setActiveSev(''); setActiveSearch(''); setSearchInput(''); fetchHistory(0, '', '') }}
                style={{ marginLeft: '6px', padding: '3px 10px', border: '1px solid #334155', borderRadius: '20px', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
                Clear all filters
              </button>
            )}
            {activeSearch && (
              <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '4px' }}>
                Searching: <strong style={{ color: '#a78bfa' }}>"{activeSearch}"</strong>
              </span>
            )}
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 120px 90px 1fr 120px', gap: '8px', padding: '8px 16px', background: '#020617', fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Severity</span><span>Source</span><span>Time</span><span>Fields</span><span>Parser</span>
          </div>

          {/* Event rows */}
          <div style={{ maxHeight: '420px', overflowY: 'auto' }}>

            {/* Loading */}
            {tab === 'search' && histLoading && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>Loading...</div>
            )}

            {/* Error */}
            {tab === 'search' && histError && !histLoading && (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '6px' }}>Failed to load events</div>
                <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>{histError}</div>
                <button onClick={() => fetchHistory(histPage, activeSev, activeSearch)}
                  style={{ padding: '6px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}>
                  Retry
                </button>
              </div>
            )}

            {/* ── NO RESULTS ── */}
            {!histLoading && !histError && tab === 'search' && histEvents.length === 0 && (
              <div style={{ padding: '56px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>○</div>
                <div style={{ color: '#94a3b8', fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No results found</div>
                <div style={{ color: '#475569', fontSize: '13px', lineHeight: '1.6' }}>
                  {activeSearch && activeSev
                    ? `No ${activeSev} events matching "${activeSearch}"`
                    : activeSearch
                    ? `No events matching "${activeSearch}"`
                    : activeSev
                    ? `No ${activeSev} events in the last 24 hours`
                    : 'No events found'}
                </div>
                <button onClick={() => { setActiveSev(''); setActiveSearch(''); setSearchInput(''); fetchHistory(0, '', '') }}
                  style={{ marginTop: '16px', padding: '7px 16px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#94a3b8', cursor: 'pointer', fontSize: '13px' }}>
                  Clear filters
                </button>
              </div>
            )}

            {/* Live tab empty */}
            {tab === 'live' && liveEvents.length === 0 && (
              <div style={{ padding: '56px 20px', textAlign: 'center' }}>
                <div style={{ color: '#475569', fontSize: '13px' }}>Waiting for events — POST to http://localhost:4000/ingest</div>
              </div>
            )}

            {/* Rows */}
            {!histLoading && displayEvents.map(ev => (
              <div key={ev.id}>
                <div onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '100px 120px 90px 1fr 120px',
                    gap: '8px', padding: '9px 16px', cursor: 'pointer',
                    borderTop: '1px solid #0f172a',
                    background: expanded === ev.id ? '#1e293b' : (SEV_ROW[ev.severity] ?? '#111827'),
                    transition: 'background 0.1s'
                  }}>
                  <span><Badge sev={ev.severity} /></span>
                  <span style={{ color: '#a78bfa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sourceTag(ev)}</span>
                  <span style={{ color: '#475569', whiteSpace: 'nowrap' }}>{eventTime(ev)}</span>
                  <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {Object.entries(ev.data).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join('  ·  ')}
                  </span>
                  <span style={{ color: '#475569', fontSize: '11px', whiteSpace: 'nowrap' }}>{parserLabel(ev)}</span>
                </div>

                {/* Expanded detail */}
                {expanded === ev.id && (
                  <div style={{ background: '#020617', borderTop: '1px solid #1e293b', borderBottom: '1px solid #1e293b', padding: '12px 20px' }}>
                    <div style={{ fontSize: '11px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>All fields</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 32px' }}>
                      {Object.entries(ev.data).map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                          <span style={{ color: '#22d3ee', fontSize: '12px', whiteSpace: 'nowrap' }}>{k}</span>
                          <span style={{ color: '#e2e8f0', fontSize: '12px', wordBreak: 'break-all' }}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #1e293b', fontSize: '11px', color: '#334155' }}>
                      Event ID: {ev.id} · Source: {sourceTag(ev)} · Parser: {parserLabel(ev)}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {tab === 'search' && !histLoading && histTotal > LIMIT && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #1e293b', fontSize: '12px', color: '#64748b' }}>
              <span>Showing {histPage * LIMIT + 1}–{Math.min((histPage + 1) * LIMIT, histTotal)} of {histTotal.toLocaleString()} events</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  disabled={histPage === 0}
                  onClick={() => handlePage(histPage - 1)}
                  style={{ padding: '4px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: histPage === 0 ? '#334155' : '#94a3b8', cursor: histPage === 0 ? 'not-allowed' : 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
                  Prev
                </button>
                <span style={{ padding: '4px 10px', color: '#e2e8f0' }}>{histPage + 1}</span>
                <button
                  disabled={(histPage + 1) * LIMIT >= histTotal}
                  onClick={() => handlePage(histPage + 1)}
                  style={{ padding: '4px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: (histPage + 1) * LIMIT >= histTotal ? '#334155' : '#94a3b8', cursor: (histPage + 1) * LIMIT >= histTotal ? 'not-allowed' : 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}