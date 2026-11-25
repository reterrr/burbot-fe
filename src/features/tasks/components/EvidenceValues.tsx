import { Alert, Card, Typography } from 'antd'
import { ArrowRight } from 'lucide-react'
import { CanonicalValue } from '../../monitoring/CanonicalValue'
import type { MonitoringReview } from '../api/contracts'
import { RecordId } from './TaskPresentation'

type Values = Pick<
  MonitoringReview,
  | 'canonicalValue'
  | 'canonicalValueId'
  | 'canonicalValueScope'
  | 'canonicalDisplay'
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

function compareCanonicalEvidence({
  canonicalValue: canonical,
  canonicalDisplay: display,
  currentEvidence: evidence,
}: Values) {
  if (canonical == null)
    return 'No canonical value is available for comparison.'
  if (display?.kind === 'reference' || display?.itemKind === 'reference') {
    const targets =
      display.kind === 'reference' ? [display] : (display.items ?? [])
    if (targets.some((item) => !item.resolved))
      return 'Referenced business object could not be resolved.'
    if (targets.length > 0)
      return evidence == null
        ? 'Reference target resolved.'
        : 'Reference target resolved. Evidence requires semantic validation.'
    return 'Extracted text cannot be directly compared with this field type.'
  }
  if (evidence == null) return 'No extracted text is available for comparison.'
  const comparable =
    ((display?.kind === 'string' || display?.kind === 'text') &&
      typeof canonical === 'string' &&
      typeof evidence === 'string') ||
    (display?.kind === 'list' &&
      (display.itemKind === 'string' || display.itemKind === 'text') &&
      Array.isArray(canonical) &&
      canonical.every((item) => typeof item === 'string') &&
      Array.isArray(evidence))
  if (!comparable)
    return 'Extracted text cannot be directly compared with this field type.'
  return JSON.stringify(canonical) === JSON.stringify(evidence)
    ? 'Recorded evidence matches the canonical value.'
    : 'Recorded evidence differs from the canonical value.'
}

export function EvidenceValues({ review }: { review: Values }) {
  const initial = review.evidenceStatus === 'INITIAL_EVIDENCE'
  const reference =
    review.canonicalDisplay?.kind === 'reference' ||
    review.canonicalDisplay?.itemKind === 'reference'
  return (
    <>
      <Card
        title={
          review.canonicalValueScope === 'current'
            ? 'Current canonical value'
            : 'Canonical value'
        }
        size="small"
        extra={
          review.canonicalValueId != null && (
            <RecordId id={review.canonicalValueId} prefix="Value record" />
          )
        }
      >
        <CanonicalValue context={review} />
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
      {(initial || reference) && (
        <Alert
          type="info"
          showIcon
          message={
            initial
              ? 'First observation — no previous baseline'
              : 'Canonical comparison'
          }
          description={compareCanonicalEvidence(review)}
        />
      )}
    </>
  )
}
