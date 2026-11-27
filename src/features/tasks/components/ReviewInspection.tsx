import {
  Button,
  Card,
  Collapse,
  Descriptions,
  Drawer,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useState } from 'react'
import { Link } from 'react-router'
import { websiteUrl } from '../../../lib/website-url'
import { SnapshotLink } from '../../monitoring/SnapshotLink'
import { snapshotSelectorContext } from '../../monitoring/snapshot-api'
import type { MonitoringReview } from '../api/contracts'
import type { ReviewSelector } from '../api/review-contracts'
import { label } from '../presentation'
import {
  ExecutionStatus,
  LocatorDetails,
  ResultDetails,
  SelectorRecipes,
} from './SelectorRecipes'
import { JsonValue, Timestamp } from './TaskPresentation'

const versionColors: Record<ReviewSelector['version']['status'], string> = {
  active: 'green',
  superseded: 'purple',
  draft: 'gold',
  rejected: 'red',
}

function SelectorSummary({
  selector,
  sourceUrl,
  inspect,
}: {
  selector: MonitoringReview['selector']
  sourceUrl?: string | null
  inspect: () => void
}) {
  const version = selector?.version
  const firstLocator = version?.recipes[0]?.parts[0]?.locators[0]
  const extractionTypes = [
    ...new Set(
      version?.recipes.flatMap((recipe) =>
        recipe.parts.map((part) => part.extraction.type),
      ),
    ),
  ]
  return (
    <Card
      role="region"
      aria-labelledby="review-selector-title"
      title={
        <h2 id="review-selector-title" className="task-review-heading">
          Selector
        </h2>
      }
      size="small"
      extra={
        selector && (
          <Button size="small" onClick={inspect}>
            Inspect selector
          </Button>
        )
      }
    >
      {selector && version ? (
        <div className="task-stack">
          <Descriptions
            size="small"
            column={{ xs: 1, md: 2 }}
            items={[
              {
                key: 'uuid',
                label: 'Selector UUID',
                span: 'filled',
                children: (
                  <Typography.Text
                    code
                    copyable={{
                      tooltips: ['Copy selector UUID', 'Selector UUID copied'],
                    }}
                  >
                    {selector.identity.uuid}
                  </Typography.Text>
                ),
              },
              {
                key: 'version',
                label: 'Capture version',
                children: `Version ${version.versionNo}`,
              },
              {
                key: 'status',
                label: 'Stored version status',
                children: (
                  <Tag color={versionColors[version.status]}>
                    {label(version.status)}
                  </Tag>
                ),
              },
              {
                key: 'extraction',
                label: 'Extraction type',
                children: extractionTypes.join(', '),
              },
              {
                key: 'recipes',
                label: 'Recipes',
                children: version.recipes.length,
              },
              {
                key: 'source',
                label: 'Source URL',
                span: 'filled',
                children: sourceUrl ?? '—',
              },
            ]}
          />
          {firstLocator && (
            <div className="task-locator-preview">
              <Typography.Text type="secondary">First locator</Typography.Text>
              <LocatorDetails locator={firstLocator} />
            </div>
          )}
        </div>
      ) : (
        <Typography.Text type="secondary">
          Selector version unavailable for this capture
        </Typography.Text>
      )}
    </Card>
  )
}

function ExecutionDiagnostics({
  review,
}: {
  review: Pick<MonitoringReview, 'selector' | 'evaluation'>
}) {
  const { evaluation, selector } = review
  return (
    <Card
      role="region"
      aria-labelledby="review-diagnostics-title"
      title={
        <h2 id="review-diagnostics-title" className="task-review-heading">
          Execution diagnostics
        </h2>
      }
      size="small"
      extra={<ExecutionStatus status={evaluation?.result.status} />}
    >
      {evaluation ? (
        <div className="task-stack">
          <Descriptions
            size="small"
            column={{ xs: 1, md: 2 }}
            items={[
              {
                key: 'provenance',
                label: 'Provenance',
                children: label(evaluation.provenance),
              },
              {
                key: 'time',
                label: 'Evaluated at',
                children: <Timestamp value={evaluation.evaluatedAt} />,
              },
              {
                key: 'run',
                label: 'Extraction run',
                children: `#${evaluation.extractionRunId}`,
              },
              {
                key: 'snapshot',
                label: 'Snapshot',
                children: `#${evaluation.sourceSnapshotId}`,
              },
              {
                key: 'page',
                label: 'Captured page',
                span: 'filled',
                children: evaluation.pageUrl,
              },
            ]}
          />
          <ResultDetails result={evaluation.result} />
          {selector && (
            <SelectorRecipes
              recipes={selector.version.recipes}
              evaluation={evaluation.result}
            />
          )}
        </div>
      ) : (
        <Typography.Text type="secondary">
          Diagnostics unavailable for this capture
        </Typography.Text>
      )}
    </Card>
  )
}

export function ReviewInspection({
  review,
  sourceCheckId,
}: {
  review: Pick<
    MonitoringReview,
    'selector' | 'evaluation' | 'source' | 'snapshot' | 'extractionRunId' | 'checkId' | 'archive'
  >
  sourceCheckId?: string
}) {
  const [selectorOpen, setSelectorOpen] = useState(false)
  const { selector, source, snapshot } = review
  const url = websiteUrl(source?.url)
  const version = selector?.version
  const inspectSelector = () => setSelectorOpen(true)
  return (
    <>
      <SelectorSummary
        selector={selector}
        sourceUrl={source?.url}
        inspect={inspectSelector}
      />
      <ExecutionDiagnostics review={review} />
      <Card
        title={<h2 className="task-review-heading">Source &amp; snapshot</h2>}
        size="small"
      >
        <div className="task-stack">
          <Space wrap size={[16, 8]}>
            {source && (
              <>
                <Link
                  to={`/monitoring/sources/${source.id}${sourceCheckId ? `?check=${sourceCheckId}` : ''}`}
                >
                  Open source review
                </Link>
                <Link to={`/tasks/history?source=${source.id}`}>
                  Source #{source.id} workflow history
                </Link>
              </>
            )}
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open original website
              </a>
            )}
            {snapshot && (
              <SnapshotLink
                sourceId={snapshot.source_id}
                snapshotId={snapshot.id}
                checkId={review.checkId ?? undefined}
                archive={review.archive}
                selectorContext={snapshotSelectorContext(review)}
                small
              />
            )}
            {selector && (
              <Button size="small" onClick={inspectSelector}>
                Inspect SelectorTree
              </Button>
            )}
          </Space>
          {url && (
            <Typography.Text type="secondary">
              The current website may differ from the captured snapshot.
            </Typography.Text>
          )}
          {!snapshot && (
            <Typography.Text type="secondary">
              Snapshot details unavailable for this capture
            </Typography.Text>
          )}
          {review.extractionRunId != null && !review.evaluation && (
            <Typography.Text type="secondary">
              Extraction run #{review.extractionRunId}
            </Typography.Text>
          )}
        </div>
      </Card>
      {selector && version && (
        <Drawer
          title={`SelectorTree · Version ${version.versionNo}`}
          width="min(100vw, 760px)"
          open={selectorOpen}
          onClose={() => setSelectorOpen(false)}
          destroyOnHidden
          className="task-review-inspector"
        >
          <div className="task-stack">
            <Descriptions
              size="small"
              column={1}
              items={[
                {
                  key: 'uuid',
                  label: 'Version UUID',
                  children: (
                    <Typography.Text code>{version.uuid}</Typography.Text>
                  ),
                },
                {
                  key: 'id',
                  label: 'Version ID',
                  children: `#${selector.versionId}`,
                },
                {
                  key: 'status',
                  label: 'Stored version status',
                  children: (
                    <Tag color={versionColors[version.status]}>
                      {label(version.status)}
                    </Tag>
                  ),
                },
                {
                  key: 'created',
                  label: 'Version created at',
                  children: <Timestamp value={version.createdAt} />,
                },
                {
                  key: 'target',
                  label: 'Target field',
                  children: selector.identity.target.field,
                },
                {
                  key: 'object',
                  label: 'Target object',
                  children: selector.identity.target.objectId,
                },
              ]}
            />
            <SelectorRecipes recipes={version.recipes} />
            <Collapse
              size="small"
              items={[
                {
                  key: 'portable',
                  label: 'Portable definition',
                  children: (
                    <JsonValue
                      value={{
                        selector: selector.identity,
                        versions: [version],
                      }}
                    />
                  ),
                },
              ]}
            />
          </div>
        </Drawer>
      )}
    </>
  )
}
