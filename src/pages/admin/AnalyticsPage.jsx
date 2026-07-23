import { useEffect, useState, useCallback } from 'react'
import { getAnalytics } from '../../lib/admin'
import './admin.css'

export default function AnalyticsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const stats = await getAnalytics()
      setData(stats)
    } catch (err) {
      setError(err?.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (loading) {
    return (
      <div className="admin-loading" style={{ margin: '40px auto', textAlign: 'center' }}>
        Loading analytics data…
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-card" style={{ maxWidth: 600, margin: '20px auto', padding: 20 }}>
        <h2 style={{ color: '#ef4444', margin: '0 0 10px' }}>Error Loading Analytics</h2>
        <p style={{ color: 'var(--text)', margin: '0 0 20px' }}>{error}</p>
        <button type="button" className="upload-btn" onClick={refresh}>Try Again</button>
      </div>
    )
  }

  const { total_downloads, format_breakdown, top_batches, daily_trend, recent_downloads } = data
  const totalFormat = (format_breakdown.png || 0) + (format_breakdown.pdf || 0)
  const pngPct = totalFormat > 0 ? Math.round((format_breakdown.png / totalFormat) * 100) : 0
  const pdfPct = totalFormat > 0 ? 100 - pngPct : 0

  // SVG trend chart calculations
  const maxTrendVal = daily_trend.length > 0
    ? Math.max(...daily_trend.map(d => (d.png || 0) + (d.pdf || 0)), 10)
    : 10

  const chartHeight = 150
  const chartWidth = 700

  return (
    <div className="admin-content-grid" style={{ gridTemplateColumns: '1fr', gap: '24px', maxWidth: '1000px', margin: '0 auto', padding: '0 16px' }}>
      
      {/* ── Overview Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="admin-card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
          <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Exports
          </span>
          <h2 style={{ fontSize: '42px', fontWeight: 800, margin: '8px 0 0', color: 'var(--text-h, #0f172a)' }}>
            {total_downloads}
          </h2>
          <div style={{ position: 'absolute', right: '-10px', bottom: '-10px', opacity: 0.05, pointerEvents: 'none' }}>
            <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          </div>
        </div>

        <div className="admin-card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
          <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            PNG Files
          </span>
          <h2 style={{ fontSize: '42px', fontWeight: 800, margin: '8px 0 0', color: '#10b981' }}>
            {format_breakdown.png || 0}
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
            {pngPct}% of total formats
          </span>
        </div>

        <div className="admin-card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
          <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            PDF Documents
          </span>
          <h2 style={{ fontSize: '42px', fontWeight: 800, margin: '8px 0 0', color: '#3b82f6' }}>
            {format_breakdown.pdf || 0}
          </h2>
          <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
            {pdfPct}% of total formats
          </span>
        </div>
      </div>

      {/* ── Layout split: Chart vs Leaderboard ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        
        {/* Trend Chart */}
        <div className="admin-card" style={{ padding: '24px' }}>
          <div className="admin-card-header" style={{ marginBottom: '16px' }}>
            <h2 className="admin-card-title">Export Activity (Last 30 Days)</h2>
          </div>
          <div style={{ position: 'relative', width: '100%', overflowX: 'auto', paddingBottom: '8px' }}>
            <div style={{ minWidth: '600px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              
              {/* Simple CSS-based bar chart */}
              <div style={{ display: 'flex', alignItems: 'flex-end', height: `${chartHeight}px`, gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                {daily_trend.map((d) => {
                  const pngH = Math.max(1, Math.round(((d.png || 0) / maxTrendVal) * chartHeight))
                  const pdfH = Math.max(0, Math.round(((d.pdf || 0) / maxTrendVal) * chartHeight))
                  const totalCount = (d.png || 0) + (d.pdf || 0)
                  return (
                    <div 
                      key={d.date} 
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%', position: 'relative' }}
                      title={`${d.date}: ${d.png} PNG, ${d.pdf} PDF (${totalCount} total)`}
                    >
                      <div style={{ width: '12px', display: 'flex', flexDirection: 'column', borderRadius: '3px', overflow: 'hidden' }}>
                        {/* PDF segment */}
                        <div style={{ height: `${pdfH}px`, background: '#3b82f6', width: '100%' }} />
                        {/* PNG segment */}
                        <div style={{ height: `${pngH}px`, background: '#10b981', width: '100%' }} />
                      </div>
                      
                      {/* X-axis tick under every 5th item */}
                      {parseInt(d.date.slice(-2), 10) % 5 === 0 && (
                        <span style={{ fontSize: '9px', color: 'var(--text-muted, #64748b)', position: 'absolute', bottom: '-20px', whiteSpace: 'nowrap' }}>
                          {d.date.slice(5)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ height: '16px' }} /> {/* Spacing for labels */}

              {/* Legend */}
              <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '2px' }} />
                  <span>PNG downloads</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '10px', height: '10px', background: '#3b82f6', borderRadius: '2px' }} />
                  <span>PDF downloads</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Batches */}
        <div className="admin-card" style={{ padding: '24px' }}>
          <div className="admin-card-header" style={{ marginBottom: '16px' }}>
            <h2 className="admin-card-title">Top 10 Batches</h2>
          </div>
          <ul className="manager-list" style={{ margin: 0, padding: 0 }}>
            {top_batches.length === 0 ? (
              <li className="manager-empty">No downloads logged yet.</li>
            ) : (
              top_batches.map((b, idx) => (
                <li key={b.batch} className="manager-row" style={{ padding: '12px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--text-muted)', fontSize: '13px', width: '20px' }}>
                      #{idx + 1}
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 650, color: 'var(--text-h)', fontFamily: 'var(--mono, monospace)' }}>
                        {b.batch}
                      </span>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-muted)' }}>
                      {b.count} export{b.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* ── Recent Downloads Log ── */}
      <div className="admin-card" style={{ padding: '24px' }}>
        <div className="admin-card-header" style={{ marginBottom: '16px' }}>
          <h2 className="admin-card-title">Recent Downloads</h2>
        </div>
        <ul className="manager-list" style={{ margin: 0, padding: 0 }}>
          {recent_downloads.length === 0 ? (
            <li className="manager-empty">No downloads logged yet.</li>
          ) : (
            recent_downloads.map((item, idx) => {
              const date = new Date(item.created_at)
              return (
                <li key={idx} className="manager-row" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span 
                        style={{ 
                          fontSize: '10px', 
                          fontWeight: 800, 
                          textTransform: 'uppercase', 
                          padding: '3px 8px', 
                          borderRadius: '4px',
                          background: item.format === 'png' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                          color: item.format === 'png' ? '#10b981' : '#3b82f6',
                          border: item.format === 'png' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(59, 130, 246, 0.2)'
                        }}
                      >
                        {item.format}
                      </span>
                      <span style={{ fontFamily: 'var(--mono, monospace)', fontWeight: 650, color: 'var(--text-h)' }}>
                        {item.batch}
                      </span>
                      {item.aspect && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.04)', padding: '2px 6px', borderRadius: '4px' }}>
                          {item.aspect} aspect
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </div>

    </div>
  )
}
