import { useEffect, useState, useCallback, useMemo } from 'react'
import { getAnalytics } from '../../lib/admin'
import './admin.css'
import './AnalyticsPage.css'

export default function AnalyticsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [formatFilter, setFormatFilter] = useState('all')
  const [hoveredIndex, setHoveredIndex] = useState(null)

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

  const filteredRecentDownloads = useMemo(() => {
    if (!data?.recent_downloads) return []
    if (formatFilter === 'all') return data.recent_downloads
    return data.recent_downloads.filter((item) => item.format === formatFilter)
  }, [data?.recent_downloads, formatFilter])

  if (loading && !data) {
    return (
      <div className="analytics-container" style={{ margin: '80px auto', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', fontSize: '15px', color: 'var(--text-muted)' }}>
          <svg className="admin-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
            <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" /><line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
          </svg>
          Loading analytics dashboard…
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="analytics-container">
        <div className="analytics-card" style={{ maxWidth: 500, margin: '40px auto', textAlign: 'center', padding: '32px' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h2 style={{ color: '#ef4444', margin: '0 0 8px', fontSize: '18px' }}>Failed to Load Analytics</h2>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 24px', fontSize: '14px' }}>{error}</p>
          <button type="button" className="analytics-refresh-btn" onClick={refresh} style={{ margin: '0 auto' }}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const { total_downloads = 0, format_breakdown = { png: 0, pdf: 0 }, top_batches = [], daily_trend = [] } = data || {}
  const totalFormat = (format_breakdown.png || 0) + (format_breakdown.pdf || 0)
  const pngPct = totalFormat > 0 ? Math.round(((format_breakdown.png || 0) / totalFormat) * 100) : 0
  const pdfPct = totalFormat > 0 ? 100 - pngPct : 0

  const maxBatchCount = top_batches.length > 0 ? Math.max(...top_batches.map(b => b.count), 1) : 1

  // ── SVG Trend Chart Calculations ──
  const svgWidth = 700
  const svgHeight = 220
  const padLeft = 45
  const padRight = 20
  const padTop = 25
  const padBottom = 35
  const graphW = svgWidth - padLeft - padRight
  const graphH = svgHeight - padTop - padBottom

  const maxValRaw = daily_trend.length > 0
    ? Math.max(...daily_trend.map(d => (d.png || 0) + (d.pdf || 0)), 1)
    : 5
  // Round up maxVal to a clean step multiple (e.g. 5, 10, 20, 50, 100)
  const maxVal = maxValRaw <= 5 ? 5 : Math.ceil(maxValRaw / 5) * 5

  const trendPoints = daily_trend.map((d, i) => {
    const x = padLeft + (daily_trend.length > 1 ? (i / (daily_trend.length - 1)) * graphW : graphW / 2)
    const pngVal = d.png || 0
    const pdfVal = d.pdf || 0
    const totalVal = pngVal + pdfVal

    const yPng = padTop + graphH - (pngVal / maxVal) * graphH
    const yPdf = padTop + graphH - (pdfVal / maxVal) * graphH
    const yTotal = padTop + graphH - (totalVal / maxVal) * graphH

    return { ...d, index: i, x, yPng, yPdf, yTotal, pngVal, pdfVal, totalVal }
  })

  // Format date helper (e.g. "2026-07-05" -> "Jul 5")
  const formatDateLabel = (dateStr) => {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const mIdx = parseInt(parts[1], 10) - 1
      const day = parseInt(parts[2], 10)
      return `${monthNames[mIdx] || parts[1]} ${day}`
    }
    return dateStr
  }

  // Select 5 evenly spaced X-axis labels
  const tickIndices = []
  if (daily_trend.length > 0) {
    const count = Math.min(5, daily_trend.length)
    for (let k = 0; k < count; k++) {
      const idx = Math.floor((k / (count - 1)) * (daily_trend.length - 1))
      if (!tickIndices.includes(idx)) tickIndices.push(idx)
    }
  }

  // Create SVG path string for PNG line
  const pngPathD = trendPoints.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.yPng}`, '')
  const pngAreaD = trendPoints.length > 0
    ? `${pngPathD} L ${trendPoints[trendPoints.length - 1].x} ${padTop + graphH} L ${trendPoints[0].x} ${padTop + graphH} Z`
    : ''

  // Create SVG path string for PDF line
  const pdfPathD = trendPoints.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.yPdf}`, '')
  const pdfAreaD = trendPoints.length > 0
    ? `${pdfPathD} L ${trendPoints[trendPoints.length - 1].x} ${padTop + graphH} L ${trendPoints[0].x} ${padTop + graphH} Z`
    : ''

  const hoveredPoint = hoveredIndex != null ? trendPoints[hoveredIndex] : null

  return (
    <div className="analytics-container">
      
      {/* ── Page Header Banner ── */}
      <header className="analytics-header">
        <div className="analytics-title-group">
          <h1>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            Analytics & Insights
          </h1>
          <p>Real-time telemetry, download format statistics, and batch usage trends</p>
        </div>

        <div className="analytics-header-actions">
          <span className="analytics-time-tag">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
            Last 30 Days
          </span>
          <button 
            type="button" 
            className="analytics-refresh-btn" 
            onClick={refresh}
            disabled={loading}
          >
            <svg className={loading ? 'admin-spin' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* ── Overview KPI Cards ── */}
      <div className="analytics-kpi-grid">
        
        {/* Total Downloads Card */}
        <div className="analytics-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Total Exports</span>
            <div className="kpi-icon-wrap total">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
          </div>
          <div className="kpi-value">{total_downloads.toLocaleString()}</div>
          <div className="kpi-meter-bg">
            <div className="kpi-meter-fill" style={{ width: '100%', background: 'linear-gradient(90deg, #6366f1, #818cf8)' }} />
          </div>
          <div className="kpi-subtext">
            <span>Cumulative downloads</span>
            <span style={{ fontWeight: 700, color: 'var(--text-h)' }}>PNG + PDF</span>
          </div>
        </div>

        {/* PNG Downloads Card */}
        <div className="analytics-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">PNG Downloads</span>
            <div className="kpi-icon-wrap png">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
          </div>
          <div className="kpi-value png-text">{(format_breakdown.png || 0).toLocaleString()}</div>
          <div className="kpi-meter-bg">
            <div className="kpi-meter-fill" style={{ width: `${pngPct}%`, background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
          </div>
          <div className="kpi-subtext">
            <span>Share of total exports</span>
            <span style={{ fontWeight: 700, color: '#10b981' }}>{pngPct}%</span>
          </div>
        </div>

        {/* PDF Downloads Card */}
        <div className="analytics-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">PDF Documents</span>
            <div className="kpi-icon-wrap pdf">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
          </div>
          <div className="kpi-value pdf-text">{(format_breakdown.pdf || 0).toLocaleString()}</div>
          <div className="kpi-meter-bg">
            <div className="kpi-meter-fill" style={{ width: `${pdfPct}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }} />
          </div>
          <div className="kpi-subtext">
            <span>Share of total exports</span>
            <span style={{ fontWeight: 700, color: '#3b82f6' }}>{pdfPct}%</span>
          </div>
        </div>

        {/* Popular Format Ratio Card */}
        <div className="analytics-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Dominant Format</span>
            <div className="kpi-icon-wrap ratio">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                <path d="M22 12A10 10 0 0 0 12 2v10z" />
              </svg>
            </div>
          </div>
          <div className="kpi-value" style={{ fontSize: '32px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {pngPct >= pdfPct ? 'PNG' : 'PDF'}
            <span style={{ fontSize: '14px', fontWeight: 650, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6 }}>
              {pngPct >= pdfPct ? `${pngPct}%` : `${pdfPct}%`}
            </span>
          </div>
          <div className="kpi-meter-bg" style={{ display: 'flex', background: 'transparent' }}>
            <div style={{ width: `${pngPct}%`, height: '100%', background: '#10b981', borderRadius: '3px 0 0 3px' }} />
            <div style={{ width: `${pdfPct}%`, height: '100%', background: '#3b82f6', borderRadius: '0 3px 3px 0' }} />
          </div>
          <div className="kpi-subtext">
            <span style={{ color: '#10b981', fontWeight: 600 }}>PNG ({pngPct}%)</span>
            <span style={{ color: '#3b82f6', fontWeight: 600 }}>PDF ({pdfPct}%)</span>
          </div>
        </div>

      </div>

      {/* ── Main Dashboard Content Split ── */}
      <div className="analytics-split-grid">
        
        {/* Export Activity SVG Trend Chart */}
        <div className="analytics-card" style={{ overflow: 'hidden' }}>
          <div className="analytics-card-head">
            <h2 className="analytics-card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Export Activity (Daily Trend)
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', fontWeight: 600 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                <span>PNG</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
                <span>PDF</span>
              </div>
            </div>
          </div>

          {/* SVG Line / Area Graph */}
          <div style={{ position: 'relative', width: '100%' }}>
            <svg 
              viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
              style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="pngGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="pdfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Y-Axis Horizontal Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const yVal = padTop + graphH - ratio * graphH
                const labelVal = Math.round(ratio * maxVal)
                return (
                  <g key={idx}>
                    <line 
                      x1={padLeft} 
                      y1={yVal} 
                      x2={svgWidth - padRight} 
                      y2={yVal} 
                      stroke="var(--border, rgba(255, 255, 255, 0.08))" 
                      strokeDasharray={idx === 0 ? undefined : "3 3"} 
                      strokeWidth="1"
                    />
                    <text 
                      x={padLeft - 10} 
                      y={yVal + 4} 
                      fill="var(--text-muted, #94a3b8)" 
                      fontSize="10" 
                      textAnchor="end"
                      fontWeight="500"
                    >
                      {labelVal}
                    </text>
                  </g>
                )
              })}

              {/* PDF Area & Line */}
              {pdfAreaD && <path d={pdfAreaD} fill="url(#pdfGrad)" />}
              {pdfPathD && <path d={pdfPathD} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

              {/* PNG Area & Line */}
              {pngAreaD && <path d={pngAreaD} fill="url(#pngGrad)" />}
              {pngPathD && <path d={pngPathD} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

              {/* X-Axis Ticks & Date Labels */}
              {tickIndices.map((idx) => {
                const p = trendPoints[idx]
                if (!p) return null
                return (
                  <g key={idx}>
                    <line x1={p.x} y1={padTop + graphH} x2={p.x} y2={padTop + graphH + 5} stroke="var(--border, rgba(255, 255, 255, 0.2))" strokeWidth="1" />
                    <text 
                      x={p.x} 
                      y={padTop + graphH + 20} 
                      fill="var(--text-muted, #94a3b8)" 
                      fontSize="11" 
                      textAnchor="middle"
                      fontWeight="600"
                    >
                      {formatDateLabel(p.date)}
                    </text>
                  </g>
                )
              })}

              {/* Hover Crosshair & Dots */}
              {hoveredPoint && (
                <g>
                  <line 
                    x1={hoveredPoint.x} 
                    y1={padTop} 
                    x2={hoveredPoint.x} 
                    y2={padTop + graphH} 
                    stroke="rgba(255, 255, 255, 0.2)" 
                    strokeDasharray="4 4" 
                    strokeWidth="1"
                  />
                  {/* PNG Dot */}
                  <circle cx={hoveredPoint.x} cy={hoveredPoint.yPng} r="5" fill="#10b981" stroke="#0f172a" strokeWidth="2" />
                  {/* PDF Dot */}
                  <circle cx={hoveredPoint.x} cy={hoveredPoint.yPdf} r="5" fill="#3b82f6" stroke="#0f172a" strokeWidth="2" />
                </g>
              )}

              {/* Transparent Hover Hit Overlay Rects */}
              {trendPoints.map((p, i) => {
                const colW = graphW / trendPoints.length
                return (
                  <rect
                    key={i}
                    x={p.x - colW / 2}
                    y={padTop}
                    width={colW}
                    height={graphH}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                )
              })}
            </svg>

            {/* Floating Tooltip Card */}
            {hoveredPoint && (
              <div 
                className="graph-tooltip-card"
                style={{
                  position: 'absolute',
                  left: `${(hoveredPoint.x / svgWidth) * 100}%`,
                  top: '10px',
                  transform: 'translateX(-50%)',
                  background: 'var(--tooltip-bg, #0f172a)',
                  color: '#fff',
                  border: '1px solid var(--border, rgba(255,255,255,0.15))',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  pointerEvents: 'none',
                  zIndex: 20
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 3, color: 'var(--text-muted)' }}>
                  {formatDateLabel(hoveredPoint.date)} ({hoveredPoint.date})
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ color: '#34d399', fontWeight: 600 }}>PNG: <strong>{hoveredPoint.pngVal}</strong></span>
                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>PDF: <strong>{hoveredPoint.pdfVal}</strong></span>
                  <span style={{ color: '#fff', fontWeight: 700, borderLeft: '1px solid rgba(255,255,255,0.15)', paddingLeft: 8 }}>Total: {hoveredPoint.totalVal}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top 10 Batches Leaderboard */}
        <div className="analytics-card">
          <div className="analytics-card-head">
            <h2 className="analytics-card-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
              </svg>
              Top Batches
            </h2>
          </div>

          <ul className="leaderboard-list">
            {top_batches.length === 0 ? (
              <li style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No batch export data available.
              </li>
            ) : (
              top_batches.slice(0, 8).map((b, idx) => {
                const fillPct = Math.round((b.count / maxBatchCount) * 100)
                const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : ''
                return (
                  <li key={b.batch} className="leaderboard-item">
                    <div className="leaderboard-fill" style={{ width: `${fillPct}%` }} />
                    <div className={`rank-badge ${rankClass}`}>
                      {idx + 1}
                    </div>
                    <span className="batch-code">{b.batch}</span>
                    <span className="download-cnt">
                      {b.count} export{b.count !== 1 ? 's' : ''}
                    </span>
                  </li>
                )
              })
            )}
          </ul>
        </div>

      </div>

      {/* ── Recent Downloads Log Section ── */}
      <div className="analytics-card">
        <div className="analytics-card-head" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <h2 className="analytics-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Recent Download Log
          </h2>

          {/* Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-hover, rgba(255,255,255,0.05))', padding: '3px', borderRadius: '10px' }}>
            <button
              type="button"
              onClick={() => setFormatFilter('all')}
              style={{
                border: 'none',
                background: formatFilter === 'all' ? '#3b82f6' : 'transparent',
                color: formatFilter === 'all' ? '#fff' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFormatFilter('png')}
              style={{
                border: 'none',
                background: formatFilter === 'png' ? '#10b981' : 'transparent',
                color: formatFilter === 'png' ? '#fff' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              PNG
            </button>
            <button
              type="button"
              onClick={() => setFormatFilter('pdf')}
              style={{
                border: 'none',
                background: formatFilter === 'pdf' ? '#3b82f6' : 'transparent',
                color: formatFilter === 'pdf' ? '#fff' : 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              PDF
            </button>
          </div>
        </div>

        <ul className="recent-list">
          {filteredRecentDownloads.length === 0 ? (
            <li style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No downloads match the current filter.
            </li>
          ) : (
            filteredRecentDownloads.slice(0, 15).map((item, idx) => {
              const date = new Date(item.created_at)
              const formattedDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              const formattedTime = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

              return (
                <li key={idx} className="recent-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className={`format-pill ${item.format}`}>
                      {item.format}
                    </span>
                    <span style={{ fontFamily: 'var(--mono, monospace)', fontWeight: 700, color: 'var(--text-h)', fontSize: '14px' }}>
                      {item.batch}
                    </span>
                    {item.aspect && (
                      <span className="aspect-tag">
                        {item.aspect} aspect
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {formattedDate} at {formattedTime}
                  </span>
                </li>
              )
            })
          )}
        </ul>
      </div>

    </div>
  )
}
