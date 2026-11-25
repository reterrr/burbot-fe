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
import type { MonitoringReview } from '../api/contracts'
import type { ReviewSelector, ReviewSnapshot } from '../api/review-contracts'
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

function websiteUrl(value: string | null | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href
  } catch {
    return undefined
  }
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

function ExecutionDiagnostics({ review }: { review: MonitoringReview }) {
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
          No evaluation diagnostics recorded for this capture
        </Typography.Text>
      )}
    </Card>
  )
}

function SnapshotDetails({ snapshot }: { snapshot: ReviewSnapshot }) {
  return (
    <Descriptions
      size="small"
      column={1}
      items={[
        { key: 'source', label: 'Source', children: `#${snapshot.source_id}` },
        {
          key: 'time',
          label: 'Fetched at',
          children: <Timestamp value={snapshot.fetched_at} />,
        },
        {
          key: 'page',
          label: 'Captured page',
          children: snapshot.page_url ?? '—',
        },
        {
          key: 'type',
          label: 'Media type',
          children: snapshot.mime_type ?? '—',
        },
        {
          key: 'representation',
          label: 'Representation',
          children: snapshot.representation ?? '—',
        },
        {
          key: 'representation-version',
          label: 'Representation version',
          children: snapshot.representation_version ?? '—',
        },
        {
          key: 'hash-algorithm',
          label: 'Hash algorithm',
          children: snapshot.hash_algorithm ?? '—',
        },
        {
          key: 'content-hash',
          label: 'Content hash',
          children: (
            <Typography.Text code>
              {snapshot.content_hash ?? '—'}
            </Typography.Text>
          ),
        },
        {
          key: 'structure-hash',
          label: 'Structure hash',
          children: (
            <Typography.Text code>
              {snapshot.structure_hash ?? '—'}
            </Typography.Text>
          ),
        },
        {
          key: 'structure-version',
          label: 'Structure hash version',
          children: snapshot.structure_hash_version ?? '—',
        },
      ]}
    />
  )
}

export function ReviewInspection({ review }: { review: MonitoringReview }) {
  const [drawer, setDrawer] = useState<'selector' | 'snapshot' | null>(null)
  const { selector, source, snapshot } = review
  const url = websiteUrl(source?.url)
  const version = selector?.version
  const inspectSelector = () => setDrawer('selector')
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
              <Link to={`/tasks/history?source=${source.id}`}>
                Source #{source.id} workflow history
              </Link>
            )}
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open original website
              </a>
            )}
            {snapshot && (
              <Button size="small" onClick={() => setDrawer('snapshot')}>
                View snapshot details
              </Button>
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
          open={drawer === 'selector'}
          onClose={() => setDrawer(null)}
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
      {snapshot && (
        <Drawer
          title={`Source snapshot #${snapshot.id}`}
          width="min(100vw, 640px)"
          open={drawer === 'snapshot'}
          onClose={() => setDrawer(null)}
          destroyOnHidden
          className="task-review-inspector"
        >
          <SnapshotDetails snapshot={snapshot} />
        </Drawer>
      )}
    </>
  )
}
