import { Alert, Card, Tag, Typography } from 'antd'
import { ArrowRight } from 'lucide-react'
import { CanonicalValue } from '../../monitoring/CanonicalValue'
import type { MonitoringReview } from '../api/contracts'
import type { LocatorResult } from '../api/review-contracts'
import { extractionReasons, locatorLabels, locatorValue } from '../presentation'
import { ExecutionStatus } from './SelectorRecipes'
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
  | 'selector'
  | 'evaluation'
>

function EvidenceText({
  value,
  empty,
}: {
  value: MonitoringReview['currentEvidence']
  empty: string
}) {
  if (value == null || (Array.isArray(value) && value.length === 0))
    return <Typography.Text type="secondary">{empty}</Typography.Text>
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

function ObservedCandidates({
  evaluation,
  selector,
}: Pick<Values, 'evaluation' | 'selector'>) {
  if (!evaluation) return null
  const results = evaluation.result.recipeResults.flatMap((recipe) =>
    recipe.partResults.flatMap((part) => part.locatorResults),
  )
  const candidates = results.filter(
    (result): result is LocatorResult & {
      candidate: NonNullable<LocatorResult['candidate']>
    } =>
      result.status === 'error' &&
      result.matchCount === 1 &&
      result.candidate?.source === 'matched_element_text' &&
      result.candidate.verified === false,
  )
  if (candidates.length === 0) return null
  const locators = new Map(
    selector?.version.recipes.flatMap((recipe) =>
      recipe.parts.flatMap((part) =>
        part.locators.map((locator) => [locator.uuid, locator] as const),
      ),
    ),
  )
  return (
    <Card
      role="region"
      aria-label="Observed candidates"
      title={<h2 className="task-review-heading">Observed candidates</h2>}
      size="small"
      extra={<Tag color="gold">Unverified</Tag>}
    >
      <div className="task-stack">
        <RecordId id={evaluation.sourceSnapshotId} prefix="Snapshot" />
        {candidates.map((result) => {
          const locator = locators.get(result.locatorUuid)
          const expression = locator && locatorValue(locator)
          return (
            <div key={result.locatorUuid} className="task-locator">
              <div className="task-inspector-row">
                <Typography.Text strong>
                  {locator ? locatorLabels[locator.kind] : 'Locator'}
                </Typography.Text>
                <Typography.Text code>
                  {typeof expression === 'string' ? expression : result.locatorUuid}
                </Typography.Text>
              </div>
              <Typography.Text type="secondary">
                Target located · 1 match
              </Typography.Text>
              {result.extractionError && (
                <Typography.Text>
                  {extractionReasons[result.extractionError]}
                </Typography.Text>
              )}
              <div className="task-evidence-text">{result.candidate.rawText}</div>
            </div>
          )
        })}
      </div>
    </Card>
  )
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
          role="region"
          aria-label="Previous evidence"
          title="Previous evidence"
          size="small"
          extra={
            review.previousObservationId && (
              <span className="task-mono">#{review.previousObservationId}</span>
            )
          }
        >
          <EvidenceText value={review.previousEvidence} empty="No previous observation" />
        </Card>
        <ArrowRight size={17} aria-hidden className="task-evidence-arrow" />
        <Card
          role="region"
          aria-label="Current evidence"
          title="Current evidence"
          size="small"
          extra={
            review.observationId ? (
              <span className="task-mono">#{review.observationId}</span>
            ) : review.evaluation ? (
              review.evaluation.result.status === 'error' ? (
                <Tag color="red">Extraction failed</Tag>
              ) : (
                <ExecutionStatus status={review.evaluation.result.status} />
              )
            ) : undefined
          }
        >
          <EvidenceText value={review.currentEvidence} empty="No validated observation" />
        </Card>
      </div>
      <ObservedCandidates evaluation={review.evaluation} selector={review.selector} />
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
