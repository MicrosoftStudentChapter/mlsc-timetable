import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './BatchSelector.css'

export default function BatchSelector() {
  const [years, setYears] = useState([])
  const [yearIdx, setYearIdx] = useState('')
  const [streamIdx, setStreamIdx] = useState('')
  const [batch, setBatch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/batches')
      .then((r) => r.json())
      .then((d) => Array.isArray(d?.years) && setYears(d.years))
      .catch(() => {})
  }, [])

  const selectedYear = yearIdx === '' ? null : years[Number(yearIdx)]
  const streams = selectedYear?.streams ?? []
  const selectedStream = streamIdx === '' ? null : streams[Number(streamIdx)]
  const batches = selectedStream?.batches ?? []

  const yearOptions = useMemo(
    () =>
      years.map((y, i) => ({
        value: String(i),
        label: y.label,
        disabled: !y.streams?.length,
      })),
    [years]
  )

  const handleYear = (e) => {
    setYearIdx(e.target.value)
    setStreamIdx('')
    setBatch('')
  }
  const handleStream = (e) => {
    setStreamIdx(e.target.value)
    setBatch('')
  }
  const handleBatch = (e) => {
    const val = e.target.value
    setBatch(val)
    if (val) navigate(`/timetable/${val}`)
  }

  return (
    <div className="batch-selector">
      <p className="batch-label">Select your batch</p>

      <div className="batch-fields">
        <select
          className="batch-dropdown"
          value={yearIdx}
          onChange={handleYear}
          aria-label="Year"
        >
          <option value="" disabled>-- Year --</option>
          {yearOptions.map((y) => (
            <option key={y.value} value={y.value} disabled={y.disabled}>
              {y.label}{y.disabled ? ' (coming soon)' : ''}
            </option>
          ))}
        </select>

        <select
          className="batch-dropdown"
          value={streamIdx}
          onChange={handleStream}
          disabled={!streams.length}
          aria-label="Stream"
        >
          <option value="" disabled>-- Stream --</option>
          {streams.map((s, i) => (
            <option key={s.code} value={String(i)}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          className="batch-dropdown"
          value={batch}
          onChange={handleBatch}
          disabled={!batches.length}
          aria-label="Batch"
        >
          <option value="" disabled>-- Batch --</option>
          {batches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
