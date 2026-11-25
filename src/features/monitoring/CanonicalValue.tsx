import { Typography } from 'antd'
import { websiteUrl } from '../../lib/website-url'
import { JsonValue, RecordId } from '../tasks/components/TaskPresentation'
import type { BusinessValueContext, ValueDisplay } from './display-contracts'

const wholeNumber = new Intl.NumberFormat()
const decimalNumber = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 20,
})
const floatNumber = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 17,
})
const calendarDate = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})
const localDateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formattedValue(raw: unknown, display?: ValueDisplay | null) {
  switch (display?.kind) {
    case 'string':
    case 'text':
    case 'uuid':
      if (typeof raw === 'string') return raw
      break
    case 'integer':
    case 'biginteger':
      if (display.label && /^-?\d+$/.test(display.label))
        return wholeNumber.format(BigInt(display.label))
      if (typeof raw === 'number') return wholeNumber.format(raw)
      break
    case 'float':
      if (typeof raw === 'number') return floatNumber.format(raw)
      break
    case 'decimal':
      if (typeof raw === 'number') return floatNumber.format(raw)
      if (typeof raw === 'string' && /^[+-]?\d+(?:\.\d{1,20})?$/.test(raw))
        return decimalNumber.format(raw as `${number}`)
      break
    case 'enum':
      if (typeof raw === 'string') return raw
      if (typeof raw === 'number') return wholeNumber.format(raw)
      break
    case 'boolean':
      if (typeof raw === 'boolean') return raw ? 'Yes' : 'No'
      break
    case 'date':
      if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const date = new Date(`${raw}T00:00:00Z`)
        if (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === raw
        )
          return calendarDate.format(date)
      }
      break
    case 'datetime':
      if (typeof raw === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
        const date = new Date(raw)
        if (Number.isFinite(date.getTime())) return localDateTime.format(date)
      }
      break
  }
}

function LinkedValue({
  display,
  compact,
}: {
  display: ValueDisplay
  compact: boolean
}) {
  const target = display.target
  const isReference = display.kind === 'reference'
  if (!target)
    return (
      <Typography.Text type="secondary">
        {isReference
          ? 'Invalid business object reference'
          : 'Invalid source reference'}
      </Typography.Text>
    )
  const prefix = isReference ? 'BusinessObject' : 'Source'
  const name = display.label
  const url =
    !isReference && display.labelIsCurrent ? websiteUrl(name) : undefined
  if (!name || name === `${prefix} #${target.id}`)
    return <RecordId id={target.id} prefix={prefix} copy={!compact} />

  return (
    <div>
      {url && !compact ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="task-evidence-text"
        >
          {name}
        </a>
      ) : (
        <span className={compact ? 'monitoring-value' : 'task-evidence-text'}>
          {name}
        </span>
      )}
      <div className="task-value-meta">
        {isReference && <span>Reference →</span>}
        <RecordId id={target.id} prefix={prefix} copy={!compact} />
        {!compact && display.labelIsCurrent && (
          <span>· {isReference ? 'Current name' : 'Current URL'}</span>
        )}
      </div>
    </div>
  )
}

function TypedValue({
  raw,
  display,
  compact,
}: {
  raw: unknown
  display?: ValueDisplay | null
  compact: boolean
}) {
  if (raw == null)
    return <Typography.Text type="secondary">Null</Typography.Text>
  if (display?.kind === 'reference' || display?.kind === 'source')
    return <LinkedValue display={display} compact={compact} />
  if (display?.kind === 'list' && display.items && Array.isArray(raw))
    return display.items.length ? (
      <ol
        className={
          compact
            ? 'task-evidence-values monitoring-value'
            : 'task-evidence-values'
        }
      >
        {display.items.map((item, index) => (
          <li key={index}>
            <TypedValue raw={item.rawValue} display={item} compact={compact} />
          </li>
        ))}
      </ol>
    ) : (
      <Typography.Text type="secondary">Empty list</Typography.Text>
    )

  const value =
    formattedValue(raw, display) ?? (typeof raw === 'string' ? raw : undefined)
  if (value != null || compact)
    return (
      <span className={compact ? 'monitoring-value' : 'task-evidence-text'}>
        {value === '' ? <i>Empty text</i> : (value ?? JSON.stringify(raw))}
      </span>
    )
  return <JsonValue value={raw} />
}

export function CanonicalValue({
  context,
  compact = false,
}: {
  context: Pick<
    BusinessValueContext,
    'canonicalValue' | 'canonicalValueId' | 'canonicalDisplay'
  >
  compact?: boolean
}) {
  const { canonicalValue, canonicalValueId, canonicalDisplay } = context
  if (canonicalValue == null && canonicalValueId == null)
    return (
      <Typography.Text type="secondary">No canonical value</Typography.Text>
    )
  return (
    <TypedValue
      raw={canonicalValue}
      display={canonicalDisplay}
      compact={compact}
    />
  )
}
