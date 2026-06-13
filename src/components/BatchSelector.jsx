import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './BatchSelector.css'

export default function BatchSelector() {
  const [batches, setBatches] = useState([])
  const [selected, setSelected] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/batches')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setBatches(d))
      .catch(() => {})
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setSelected(val)
    if (val) navigate(`/timetable/${val}`)
  }

  return (
    <div className="batch-selector">
      <p className="batch-label">Select your sub-group</p>
      <select className="batch-dropdown" value={selected} onChange={handleChange}>
        <option value="" disabled>-- choose a group --</option>
        {batches.map(({ pool, groups }) => (
          <optgroup key={pool} label={pool}>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
