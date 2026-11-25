import { Alert, Button, Card, Empty, Spin, Tag, Typography } from 'antd'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { businessFieldTitle, sourceTitle } from '../../monitoring/presentation'
import type {
  MonitoringReview,
  TaskReference,
  TaskStatus,
  WorkflowStatus,
} from '../api/contracts'
import { label } from '../presentation'

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const statusColors: Record<TaskStatus | WorkflowStatus, string> = {
  pending: 'gold',
  in_progress: 'blue',
  completed: 'green',
  failed: 'red',
  cancelled: 'default',
  active: 'green',
  superseded: 'purple',
}

export function StatusTag({ status }: { status: TaskStatus | WorkflowStatus }) {
  return <Tag color={statusColors[status]}>{label(status)}</Tag>
}

export function Timestamp({ value }: { value?: string | null }) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  return (
    <time dateTime={value} title={value}>
      {dateFormat.format(new Date(value))}
    </time>
  )
}

export function TaskLoading() {
  return (
    <div className="task-loading" role="status">
      <Spin /> Loading tasks…
    </div>
  )
}

export function RequestFailure({
  message,
  error,
  retry,
}: {
  message: string
  error?: { message: string } | null
  retry?: () => void
}) {
  return (
    <Alert
      type="error"
      showIcon
      message={message}
      description={error?.message}
      action={retry && <Button onClick={retry}>Retry</Button>}
    />
  )
}

export function TaskHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string; state?: unknown }
}) {
  return (
    <header className="task-header">
      {back && (
        <Link className="task-back" to={back.to} state={back.state}>
          <ArrowLeft size={15} />
          {back.label}
        </Link>
      )}
      <div className="task-header-main">
        <div>
          <Typography.Title level={1}>{title}</Typography.Title>
          {subtitle && <div className="task-subtitle">{subtitle}</div>}
        </div>
        {actions && <div className="task-header-actions">{actions}</div>}
      </div>
    </header>
  )
}

export function JsonValue({ value }: { value: unknown }) {
  return (
    <pre className="task-json">
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  )
}

export function RecordId({
  id,
  prefix,
  copy = true,
}: {
  id: number
  prefix?: string
  copy?: boolean
}) {
  return (
    <Typography.Text
      type="secondary"
      className="task-record-id"
      copyable={
        copy && { text: String(id), tooltips: ['Copy ID', 'ID copied'] }
      }
    >
      {prefix && `${prefix} `}#{id}
    </Typography.Text>
  )
}

const referenceLabels: Record<TaskReference['reference_type'], string> = {
  source: 'Source',
  source_snapshot: 'Source snapshot',
  extraction_run: 'Extraction run',
  observation: 'Field observation',
  business_entity: 'Business entity',
  business_object: 'Business object',
  business_field: 'Business field',
  business_object_field: 'Business object field',
}

function referenceLabel(
  reference: TaskReference,
  review: MonitoringReview,
): ReactNode {
  const id = reference.reference_id
  switch (reference.reference_type) {
    case 'source':
      if (review.source?.id === id && review.source.url)
        return sourceTitle(review.source)
      break
    case 'source_snapshot':
      if (review.snapshot?.id === id && review.snapshot.fetched_at)
        return (
          <>
            Captured <Timestamp value={review.snapshot.fetched_at} />
          </>
        )
      break
    case 'extraction_run':
      if (review.extractionRunId === id && review.extractionRunStatus)
        return label(review.extractionRunStatus)
      break
    case 'observation': {
      const evidence =
        review.observationId === id
          ? review.currentEvidence
          : review.previousObservationId === id
            ? review.previousEvidence
            : null
      return Array.isArray(evidence) ? evidence.join(' · ') : evidence
    }
    case 'business_field':
      if (review.businessField?.id === id)
        return review.businessField.name || review.businessField.persistentKey
      break
    case 'business_object_field':
      if (review.businessObjectFieldId === id && review.businessField) {
        const fieldName = businessFieldTitle(review.businessField)
        const objectName = review.businessObject?.name
        return objectName ? `${fieldName} · ${objectName}` : fieldName
      }
      break
    case 'business_object':
      if (review.businessObject?.id === id) return review.businessObject.name
      break
  }
}

export function TaskReferences({
  references,
  review,
}: {
  references: TaskReference[]
  review?: MonitoringReview
}) {
  return (
    <Card title="References" size="small">
      {references.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No references"
        />
      ) : (
        <ul className="task-references">
          {references.map((reference) => {
            const detail = review && referenceLabel(reference, review)
            const id = reference.reference_id
            const source = reference.reference_type === 'source'
            return (
              <li key={reference.id}>
                <span className="task-reference-kind">
                  {referenceLabels[reference.reference_type]}
                  <small>{label(reference.role)}</small>
                </span>
                <div className="task-reference-value">
                  {source ? (
                    <Link
                      to={`/tasks/history?source=${id}`}
                      title="Open source workflow history"
                    >
                      {detail || `#${id}`}
                    </Link>
                  ) : (
                    detail && <span>{detail}</span>
                  )}
                  {(!source || detail) && <RecordId id={id} />}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
