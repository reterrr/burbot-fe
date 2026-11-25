import { Alert, Button, Card, Empty, Spin, Tag, Typography } from 'antd'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { TechnicalId } from '../../monitoring/BusinessValue'
import { sourceTitle } from '../../monitoring/presentation'
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
            const display = review?.referenceDisplays?.[reference.id]
            const isSource = reference.reference_type === 'source'
            const source =
              isSource && review?.source?.id === reference.reference_id
                ? review.source
                : null
            const title =
              source && (source.name || source.url)
                ? sourceTitle(source)
                : display?.label
            const text = title || (display?.status && label(display.status))
            const details = display?.capturedAt ? (
              <>
                Captured <Timestamp value={display.capturedAt} />
              </>
            ) : (
              text
            )
            return (
              <li key={reference.id}>
                <div>
                  {referenceLabels[reference.reference_type]}
                  <small>{label(reference.role)}</small>
                </div>
                <div className="task-reference-detail">
                  {isSource ? (
                    <Link
                      to={`/tasks/history?source=${reference.reference_id}`}
                      title="Open source workflow history"
                    >
                      {details || `#${reference.reference_id}`}
                    </Link>
                  ) : (
                    details && <span>{details}</span>
                  )}
                  {(!isSource || details) && (
                    <TechnicalId id={reference.reference_id} copy />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
