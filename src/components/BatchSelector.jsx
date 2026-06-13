import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadBatches } from '../lib/batches'
import './BatchSelector.css'

export default function BatchSelector() {
  const [years, setYears] = useState([])
  const [yearInput, setYearInput] = useState('')
  const [streamInput, setStreamInput] = useState('')
  const [batchInput, setBatchInput] = useState('')
  const navigate = useNavigate()
  const lastNavigated = useRef('')

  useEffect(() => {
    let cancelled = false
    loadBatches().then((y) => {
      if (!cancelled) setYears(y)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedYear = years.find((y) => y.label === yearInput) ?? null
  const streams = selectedYear?.streams ?? []
  const selectedStream = streams.find((s) => s.name === streamInput) ?? null
  const batches = selectedStream?.batches ?? []

  // Clear lower fields when an upper selection stops resolving.
  useEffect(() => {
    if (!selectedYear) {
      if (streamInput) setStreamInput('')
      if (batchInput) setBatchInput('')
    }
  }, [selectedYear, streamInput, batchInput])

  useEffect(() => {
    if (!selectedStream && batchInput) setBatchInput('')
  }, [selectedStream, batchInput])

  // Navigate when batch input resolves to a real batch in the current stream.
  useEffect(() => {
    if (
      selectedStream &&
      batchInput &&
      batches.includes(batchInput) &&
      batchInput !== lastNavigated.current
    ) {
      lastNavigated.current = batchInput
      navigate(`/timetable/${batchInput}`)
    }
  }, [batchInput, selectedStream, batches, navigate])

  return (
    <div className="batch-selector">
      <p className="batch-label">Select your batch</p>

      <div className="batch-fields">
        <input
          className="batch-dropdown"
          list="year-list"
          value={yearInput}
          onChange={(e) => setYearInput(e.target.value)}
          placeholder="Year"
          aria-label="Year"
          autoComplete="off"
        />
        <datalist id="year-list">
          {years.map((y) => (
            <option key={y.year} value={y.label} />
          ))}
        </datalist>

        <input
          className="batch-dropdown"
          list="stream-list"
          value={streamInput}
          onChange={(e) => setStreamInput(e.target.value)}
          placeholder="Stream"
          aria-label="Stream"
          autoComplete="off"
          disabled={!selectedYear}
        />
        <datalist id="stream-list">
          {streams.map((s) => (
            <option key={s.code} value={s.name} />
          ))}
        </datalist>

        <input
          className="batch-dropdown"
          list="batch-list"
          value={batchInput}
          onChange={(e) => setBatchInput(e.target.value.toUpperCase())}
          placeholder="Batch"
          aria-label="Batch"
          autoComplete="off"
          disabled={!selectedStream}
        />
        <datalist id="batch-list">
          {batches.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </div>
    </div>
  )
}
