const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const clampMax = (values) => Math.max(...values.map(safeNumber), 1)
const shortNumber = (value) => new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(safeNumber(value))

const EmptyChart = ({ message = 'No data available.' }) => (
  <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
    {message}
  </div>
)

const GridLines = ({ left = 54, right = 16, top = 18, bottom = 42, width = 720, height = 260, maxValue = 1, formatter = shortNumber }) => {
  const plotHeight = height - top - bottom
  return Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4
    const y = top + ratio * plotHeight
    const value = maxValue * (1 - ratio)
    return (
      <g key={index}>
        <line x1={left} y1={y} x2={width - right} y2={y} stroke="currentColor" className="text-slate-200" strokeWidth="1" />
        <text x={left - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{formatter(value)}</text>
      </g>
    )
  })
}

export const LineChart = ({ data = [], xKey = 'label', yKey = 'value', valueFormatter = shortNumber, emptyMessage }) => {
  if (!data.length) return <EmptyChart message={emptyMessage} />
  const width = 720, height = 260, left = 58, right = 18, top = 18, bottom = 44
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const maxValue = clampMax(data.map((row) => row[yKey]))
  const x = (index) => left + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth)
  const y = (value) => top + plotHeight - (safeNumber(value) / maxValue) * plotHeight
  const points = data.map((row, index) => `${x(index)},${y(row[yKey])}`).join(' ')

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 min-w-[620px] w-full" role="img" aria-label="Line chart">
        <GridLines {...{ left, right, top, bottom, width, height, maxValue, formatter: valueFormatter }} />
        <polyline points={points} fill="none" stroke="currentColor" className="text-emerald-500" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((row, index) => (
          <g key={`${row[xKey]}-${index}`}>
            <circle cx={x(index)} cy={y(row[yKey])} r="5" fill="currentColor" className="text-emerald-500" />
            <circle cx={x(index)} cy={y(row[yKey])} r="2" fill="white" />
            <text x={x(index)} y={height - 14} textAnchor="middle" className="fill-slate-500 text-[10px]">{String(row[xKey] ?? '')}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export const GroupedColumnChart = ({ data = [], xKey = 'label', series = [], emptyMessage }) => {
  if (!data.length || !series.length) return <EmptyChart message={emptyMessage} />
  const width = 720, height = 260, left = 48, right = 16, top = 18, bottom = 44
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const maxValue = clampMax(data.flatMap((row) => series.map((item) => row[item.key])))
  const groupWidth = plotWidth / Math.max(data.length, 1)
  const barGap = 4
  const innerWidth = Math.min(groupWidth * 0.72, 58)
  const barWidth = Math.max(6, (innerWidth - barGap * (series.length - 1)) / series.length)

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-500">
        {series.map((item) => <span key={item.key} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${item.badgeClass || 'bg-sky-500'}`} />{item.label}</span>)}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-64 min-w-[620px] w-full" role="img" aria-label="Grouped column chart">
          <GridLines {...{ left, right, top, bottom, width, height, maxValue }} />
          {data.map((row, rowIndex) => {
            const center = left + rowIndex * groupWidth + groupWidth / 2
            const start = center - innerWidth / 2
            return (
              <g key={`${row[xKey]}-${rowIndex}`}>
                {series.map((item, seriesIndex) => {
                  const value = safeNumber(row[item.key])
                  const barHeight = (value / maxValue) * plotHeight
                  return <rect key={item.key} x={start + seriesIndex * (barWidth + barGap)} y={top + plotHeight - barHeight} width={barWidth} height={Math.max(1, barHeight)} rx="4" fill="currentColor" className={item.textClass || 'text-sky-500'} />
                })}
                <text x={center} y={height - 14} textAnchor="middle" className="fill-slate-500 text-[10px]">{String(row[xKey] ?? '')}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export const ComboChart = ({ data = [], xKey = 'label', columnKey = 'columns', lineKey = 'line', columnLabel = 'Appointments', lineLabel = 'Collections', lineFormatter = shortNumber, emptyMessage }) => {
  if (!data.length) return <EmptyChart message={emptyMessage} />
  const width = 720, height = 280, left = 54, right = 58, top = 18, bottom = 46
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const maxColumn = clampMax(data.map((row) => row[columnKey]))
  const maxLine = clampMax(data.map((row) => row[lineKey]))
  const groupWidth = plotWidth / Math.max(data.length, 1)
  const barWidth = Math.min(42, groupWidth * 0.48)
  const pointX = (index) => left + index * groupWidth + groupWidth / 2
  const lineY = (value) => top + plotHeight - (safeNumber(value) / maxLine) * plotHeight
  const linePoints = data.map((row, index) => `${pointX(index)},${lineY(row[lineKey])}`).join(' ')

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" />{columnLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-emerald-500" />{lineLabel}</span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-72 min-w-[620px] w-full" role="img" aria-label="Combination chart">
          <GridLines {...{ left, right, top, bottom, width, height, maxValue: maxColumn }} />
          {Array.from({ length: 5 }, (_, index) => {
            const ratio = index / 4
            const y = top + ratio * plotHeight
            return <text key={index} x={width - right + 8} y={y + 4} textAnchor="start" className="fill-emerald-600 text-[10px]">{lineFormatter(maxLine * (1 - ratio))}</text>
          })}
          {data.map((row, index) => {
            const value = safeNumber(row[columnKey])
            const barHeight = (value / maxColumn) * plotHeight
            return (
              <g key={`${row[xKey]}-${index}`}>
                <rect x={pointX(index) - barWidth / 2} y={top + plotHeight - barHeight} width={barWidth} height={Math.max(1, barHeight)} rx="6" fill="currentColor" className="text-sky-500" />
                <text x={pointX(index)} y={height - 14} textAnchor="middle" className="fill-slate-500 text-[10px]">{String(row[xKey] ?? '')}</text>
              </g>
            )
          })}
          <polyline points={linePoints} fill="none" stroke="currentColor" className="text-emerald-500" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {data.map((row, index) => <circle key={index} cx={pointX(index)} cy={lineY(row[lineKey])} r="4.5" fill="currentColor" className="text-emerald-500" />)}
        </svg>
      </div>
    </div>
  )
}

export const HorizontalBarChart = ({ data = [], labelKey = 'label', valueKey = 'value', valueFormatter = shortNumber, emptyMessage }) => {
  if (!data.length) return <EmptyChart message={emptyMessage} />
  const maxValue = clampMax(data.map((row) => row[valueKey]))
  return (
    <div className="space-y-4">
      {data.map((row, index) => {
        const value = safeNumber(row[valueKey])
        const width = Math.max(value > 0 ? 3 : 0, (value / maxValue) * 100)
        return (
          <div key={`${row[labelKey]}-${index}`}>
            <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
              <span className="truncate font-semibold text-slate-700">{row[labelKey]}</span>
              <span className="shrink-0 font-black text-slate-900">{valueFormatter(value)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${width}%` }} /></div>
          </div>
        )
      })}
    </div>
  )
}

export { EmptyChart }



