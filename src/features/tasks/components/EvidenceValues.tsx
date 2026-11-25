import { Alert, Card, Typography } from 'antd'
import { ArrowRight } from 'lucide-react'
import type { MonitoringReview } from '../api/contracts'
import { JsonValue } from './TaskPresentation'

type Values = Pick<
  MonitoringReview,
  | 'canonicalValue'
  | 'canonicalValueId'
  | 'previousEvidence'
  | 'previousObservationId'
  | 'currentEvidence'
  | 'observationId'
  | 'evidenceChanged'
  | 'evidenceStatus'
>

function EvidenceText({
  value,
}: {
  value: MonitoringReview['currentEvidence']
}) {
  if (value == null || (Array.isArray(value) && value.length === 0))
    return (
      <Typography.Text type="secondary">No evidence recorded</Typography.Text>
    )
  if (Array.isArray(value))
    return (
      <ol className="task-evidence-values">
        {value.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ol>
    )
  return <div className="task-evidence-text">{value || <i>Empty text</i>}</div>
}

function compareInitialEvidence(
  canonical: unknown,
  evidence: Values['currentEvidence'],
) {
  if (canonical == null)
    return 'No canonical value is available for comparison.'
  const comparable =
    (typeof canonical === 'string' && typeof evidence === 'string') ||
    (Array.isArray(canonical) &&
      canonical.every((value) => typeof value === 'string') &&
      Array.isArray(evidence))
  if (!comparable)
    return 'Canonical comparison is unavailable for these value types.'
  return JSON.stringify(canonical) === JSON.stringify(evidence)
    ? 'Recorded evidence matches the canonical value.'
    : 'Recorded evidence differs from the canonical value.'
}

export function EvidenceValues({ review }: { review: Values }) {
  return (
    <>
      {review.evidenceStatus === 'INITIAL_EVIDENCE' && (
        <Alert
          type="info"
          showIcon
          message="First observation — no previous baseline"
          description={
            <>
              <div>
                {compareInitialEvidence(
                  review.canonicalValue,
                  review.currentEvidence,
                )}
              </div>
              <div>
                Review the source and selector to confirm the first observation.
              </div>
            </>
          }
        />
      )}
      <Card
        title="Canonical value"
        size="small"
        extra={
          review.canonicalValueId && (
            <span className="task-mono">#{review.canonicalValueId}</span>
          )
        }
      >
        {review.canonicalValueId != null || review.canonicalValue != null ? (
          <JsonValue value={review.canonicalValue} />
        ) : (
          <Typography.Text type="secondary">No canonical value</Typography.Text>
        )}
      </Card>
      <div
        className={`task-evidence-grid${review.evidenceChanged ? ' is-changed' : ''}`}
      >
        <Card
          title="Previous evidence"
          size="small"
          extra={
            review.previousObservationId && (
              <span className="task-mono">#{review.previousObservationId}</span>
            )
          }
        >
          <EvidenceText value={review.previousEvidence} />
        </Card>
        <ArrowRight size={17} aria-hidden className="task-evidence-arrow" />
        <Card
          title="Current evidence"
          size="small"
          extra={
            review.observationId && (
              <span className="task-mono">#{review.observationId}</span>
            )
          }
        >
          <EvidenceText value={review.currentEvidence} />
        </Card>
      </div>
    </>
  )
}
