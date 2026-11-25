import { Alert, Card, Typography } from 'antd'
import { ArrowRight } from 'lucide-react'
import { BusinessValue, TechnicalId } from '../../monitoring/BusinessValue'
import type { CanonicalValueContext } from '../../monitoring/business-values'
import type { MonitoringReview } from '../api/contracts'

type Values = CanonicalValueContext &
  Pick<
    MonitoringReview,
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

function isText(kind?: string | null) {
  return kind === 'string' || kind === 'text'
}

function CanonicalComparison({ review }: { review: Values }) {
  const { canonicalValue, canonicalDisplay, currentEvidence } = review
  const initial = review.evidenceStatus === 'INITIAL_EVIDENCE'
  const reference = canonicalDisplay?.kind === 'reference'
  const referenceList =
    canonicalDisplay?.kind === 'list' &&
    canonicalDisplay.itemKind === 'reference'
  if (!initial && !reference && !referenceList) return null

  const targets = reference
    ? [canonicalDisplay]
    : (canonicalDisplay?.items ?? [])
  let message: string
  let semanticStatus: string | undefined
  if (canonicalValue == null) {
    message = 'No canonical value is available for comparison.'
  } else if (reference || referenceList) {
    if (targets.some((target) => target.resolved !== true)) {
      message = reference
        ? 'Referenced business object could not be resolved.'
        : 'Some referenced business objects could not be resolved.'
    } else if (targets.length === 0) {
      message = 'The canonical reference list is empty.'
    } else {
      message = reference
        ? 'Reference resolved successfully.'
        : 'References resolved successfully.'
    }
    semanticStatus = 'Evidence has not yet been semantically validated.'
  } else if (
    currentEvidence == null ||
    (Array.isArray(currentEvidence) && currentEvidence.length === 0)
  ) {
    message = 'No current evidence is available for comparison.'
  } else if (
    (isText(canonicalDisplay?.kind) &&
      typeof canonicalValue === 'string' &&
      typeof currentEvidence === 'string') ||
    (canonicalDisplay?.kind === 'list' &&
      isText(canonicalDisplay.itemKind) &&
      Array.isArray(canonicalValue) &&
      canonicalValue.every((value) => typeof value === 'string') &&
      Array.isArray(currentEvidence))
  ) {
    message =
      JSON.stringify(canonicalValue) === JSON.stringify(currentEvidence)
        ? 'Recorded evidence matches the canonical value.'
        : 'Recorded evidence differs from the canonical value.'
  } else {
    message = 'Extracted text cannot be directly compared with this field type.'
  }

  return (
    <Alert
      type="info"
      showIcon
      message={
        initial
          ? 'First observation — no previous baseline'
          : 'Canonical comparison'
      }
      description={
        <>
          <div>{message}</div>
          {semanticStatus && <div>{semanticStatus}</div>}
          {initial && (
            <div>
              Review the source and selector to confirm the first observation.
            </div>
          )}
        </>
      }
    />
  )
}

export function EvidenceValues({ review }: { review: Values }) {
  return (
    <>
      <Card
        title="Current canonical value"
        size="small"
        extra={
          review.canonicalValueId != null && (
            <TechnicalId
              name="Value record"
              id={review.canonicalValueId}
              copy
            />
          )
        }
      >
        <BusinessValue
          value={review.canonicalValue}
          display={review.canonicalDisplay}
          empty={
            review.canonicalValueId == null
              ? 'No canonical value'
              : 'Null value'
          }
        />
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
      <CanonicalComparison review={review} />
    </>
  )
}
