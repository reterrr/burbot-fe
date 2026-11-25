import { Typography } from 'antd'
import type { BusinessValueDisplay } from './business-values'

const integer = new Intl.NumberFormat()
const float = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 21 })
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 20 })
const date = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeZone: 'UTC',
})
const datetime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function TechnicalId({
  name,
  id,
  copy = false,
}: {
  name?: string
  id: number | string
  copy?: boolean
}) {
  return (
    <Typography.Text
      type="secondary"
      className="task-technical-id"
      copyable={
        copy && {
          text: `${id}`,
          tooltips: ['Copy ID', 'Copied'],
        }
      }
    >
      {name && `${name} `}#{id}
    </Typography.Text>
  )
}

function formattedScalar(kind: string | undefined, value: unknown) {
  switch (kind) {
    case 'boolean':
      if (typeof value === 'boolean') return value ? 'Yes' : 'No'
      break
    case 'integer':
    case 'biginteger':
      if (typeof value === 'number' && Number.isInteger(value))
        return integer.format(value)
      if (typeof value === 'string' && /^-?\d+$/.test(value))
        return integer.format(value as `${number}`)
      break
    case 'float':
      if (typeof value === 'number' && Number.isFinite(value))
        return float.format(value)
      break
    case 'decimal':
      if (typeof value === 'number' && Number.isFinite(value))
        return float.format(value)
      if (
        typeof value === 'string' &&
        /^[+-]?(?:\d+(?:\.\d{0,20})?|\.\d{1,20})$/.test(value)
      )
        return decimal.format(value as `${number}`)
      break
    case 'date':
      if (typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value)) {
        const day = new Date(`${value}T00:00:00Z`)
        if (Number.isFinite(+day) && day.toISOString().slice(0, 10) === value)
          return date.format(day)
      }
      break
    case 'datetime':
      if (
        typeof value === 'string' &&
        /(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
        Number.isFinite(Date.parse(value))
      )
        return datetime.format(new Date(value))
      break
  }
  return typeof value === 'string' ? value : undefined
}

export function BusinessValue({
  value,
  display,
  compact = false,
  empty = 'No canonical value',
}: {
  value: unknown
  display?: BusinessValueDisplay | null
  compact?: boolean
  empty?: string
}) {
  if (value == null)
    return <Typography.Text type="secondary">{empty}</Typography.Text>
  const valueClass = compact ? 'monitoring-value' : 'task-evidence-text'
  if (display?.kind === 'list' && Array.isArray(display.items)) {
    if (display.items.length === 0)
      return <Typography.Text type="secondary">Empty list</Typography.Text>
    return (
      <ul className="task-evidence-values">
        {display.items.map((item, index) => (
          <li key={index}>
            <BusinessValue
              value={item.rawValue}
              display={item}
              compact={compact}
              empty="No value"
            />
          </li>
        ))}
      </ul>
    )
  }
  if (
    (display?.kind === 'reference' || display?.kind === 'source') &&
    display.label
  ) {
    const target = display.target
    const name =
      target?.type === 'business_object' ? 'BusinessObject' : 'Source'
    const id = target?.idText ?? target?.id
    const hasLabel = id != null && display.label !== `${name} #${id}`
    return (
      <div>
        <div className={valueClass}>{display.label}</div>
        {target && (hasLabel || !compact) && (
          <div className="task-value-detail">
            {display.kind === 'reference' ? 'Reference' : 'Source value'}
            {hasLabel && (
              <>
                <span aria-hidden>
                  {display.kind === 'reference' ? '→' : '·'}
                </span>
                <TechnicalId name={name} id={id} copy={!compact} />
                {target.type === 'business_object' &&
                  display.labelBasis === 'current' && <span>Current name</span>}
              </>
            )}
          </div>
        )}
      </div>
    )
  }
  const text = formattedScalar(
    display?.kind,
    display?.kind === 'biginteger' ? (display.label ?? value) : value,
  )
  if (text !== undefined)
    return <div className={valueClass}>{text || <i>Empty text</i>}</div>
  return (
    <pre className={compact ? valueClass : 'task-json'}>
      {JSON.stringify(value, null, compact ? 0 : 2)}
    </pre>
  )
}
