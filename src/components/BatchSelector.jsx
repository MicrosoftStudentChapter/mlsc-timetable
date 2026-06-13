import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadBatches } from '../lib/batches'
import Combobox from './Combobox'
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

  const yearOptions = useMemo(
    () => years.map((y) => ({ value: y.label })),
    [years]
  )
  const streamOptions = useMemo(
    () => streams.map((s) => ({ value: s.name })),
    [streams]
  )
  const batchOptions = useMemo(
    () => batches.map((b) => ({ value: b })),
    [batches]
  )

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
        <Combobox
          className="batch-dropdown"
          value={yearInput}
          onChange={setYearInput}
          options={yearOptions}
          placeholder="Year"
          ariaLabel="Year"
        />
        <Combobox
          className="batch-dropdown"
          value={streamInput}
          onChange={setStreamInput}
          options={streamOptions}
          placeholder="Stream"
          ariaLabel="Stream"
          disabled={!selectedYear}
        />
        <Combobox
          className="batch-dropdown"
          value={batchInput}
          onChange={(v) => setBatchInput(v.toUpperCase())}
          options={batchOptions}
          placeholder="Batch"
          ariaLabel="Batch"
          disabled={!selectedStream}
        />
      </div>
    </div>
  )
}
