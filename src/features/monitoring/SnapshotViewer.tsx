import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Descriptions, Tabs, Typography } from 'antd'
import { Download } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import { positiveId } from '../tasks/api/task-client'
import {
  RecordId,
  RequestFailure,
  TaskHeader,
  TaskLoading,
  Timestamp,
} from '../tasks/components/TaskPresentation'
import { monitoringQueryKey } from './api'
import { sourceTitle } from './presentation'
import { snapshotApi, type SnapshotDetails } from './snapshot-api'

const SnapshotSource = lazy(() => import('./SnapshotSource'))
const numberFormat = new Intl.NumberFormat()

function Hash({ value }: { value?: string | null }) {
  return value ? (
    <Typography.Text code copyable>
      {value}
    </Typography.Text>
  ) : (
    '—'
  )
}

function Details({ details }: { details: SnapshotDetails }) {
  const { snapshot, source, artifact } = details
  return (
    <Descriptions
      size="small"
      column={{ xs: 1, md: 2 }}
      items={[
        {
          key: 'id',
          label: 'Snapshot ID',
          children: <RecordId id={snapshot.id} />,
        },
        {
          key: 'capture',
          label: 'Captured at',
          children: <Timestamp value={snapshot.fetched_at} />,
        },
        { key: 'source', label: 'Source name', children: sourceTitle(source) },
        { key: 'source-url', label: 'Source URL', children: source.url ?? '—' },
        {
          key: 'page-url',
          label: 'Captured page URL',
          children: snapshot.page_url ?? '—',
          span: 'filled',
        },
        {
          key: 'type',
          label: 'Content type',
          children: artifact?.mimeType ?? snapshot.mime_type ?? '—',
        },
        {
          key: 'size',
          label: 'File size',
          children:
            artifact?.sizeBytes == null
              ? '—'
              : `${numberFormat.format(artifact.sizeBytes)} bytes`,
        },
        {
          key: 'representation-type',
          label: 'Representation',
          children: snapshot.representation ?? '—',
        },
        {
          key: 'representation',
          label: 'Representation version',
          children: snapshot.representation_version ?? '—',
        },
        {
          key: 'structure',
          label: 'Structure hash version',
          children: snapshot.structure_hash_version ?? '—',
        },
        {
          key: 'algorithm',
          label: 'Comparison hash algorithm',
          children: snapshot.hash_algorithm ?? '—',
        },
        {
          key: 'sha256',
          label: 'Artifact SHA-256',
          children: <Hash value={artifact?.sha256} />,
          span: 'filled',
        },
        {
          key: 'content-hash',
          label: 'Content comparison hash',
          children: <Hash value={snapshot.content_hash} />,
          span: 'filled',
        },
        {
          key: 'structure-hash',
          label: 'Structure comparison hash',
          children: <Hash value={snapshot.structure_hash} />,
          span: 'filled',
        },
      ]}
    />
  )
}

export default function SnapshotViewer() {
  const params = useParams()
  const sourceId = positiveId(params.sourceId)
  const snapshotId = positiveId(params.snapshotId)
  const { state } = useLocation()
  const [tab, setTab] = useState('preview')
  const key = [...monitoringQueryKey, 'snapshot', sourceId, snapshotId]
  const back = state?.snapshotBack ?? {
    to: sourceId ? `/monitoring/sources/${sourceId}` : '/monitoring/sources',
    label: sourceId ? 'Source review' : 'Monitored sources',
  }
  const details = useQuery({
    queryKey: [...key, 'details'],
    queryFn: ({ signal }) =>
      snapshotApi.details(sourceId!, snapshotId!, signal),
    enabled: Boolean(sourceId && snapshotId),
    retry: false,
  })
  const preview = useQuery({
    queryKey: [...key, 'preview'],
    queryFn: ({ signal }) =>
      snapshotApi.preview(sourceId!, snapshotId!, signal),
    enabled: details.isSuccess && tab === 'preview',
    retry: false,
  })
  const html = useQuery({
    queryKey: [...key, 'html'],
    queryFn: ({ signal }) => snapshotApi.html(sourceId!, snapshotId!, signal),
    enabled: details.isSuccess && tab === 'source',
    retry: false,
  })
  const download = useMutation({
    mutationFn: () => snapshotApi.download(sourceId!, snapshotId!),
  })

  return (
    <div className="task-page">
      <TaskHeader
        title={snapshotId ? `Snapshot #${snapshotId}` : 'Snapshot viewer'}
        back={back}
        subtitle={
          details.data && (
            <>
              <span>{sourceTitle(details.data.source)}</span>
              <RecordId id={details.data.source.id} prefix="Source" />
            </>
          )
        }
        actions={
          details.data && (
            <Button
              icon={<Download size={16} />}
              disabled={!details.data.artifact}
              loading={download.isPending}
              onClick={() => download.mutate()}
            >
              Download original HTML
            </Button>
          )
        }
      />
      {!sourceId || !snapshotId ? (
        <RequestFailure message="Invalid source or snapshot ID" />
      ) : details.isPending ? (
        <TaskLoading message="Loading snapshot…" />
      ) : details.isError ? (
        <RequestFailure
          message="Could not load snapshot details"
          error={details.error}
          retry={() => void details.refetch()}
        />
      ) : (
        <div className="task-stack">
          {download.isError && (
            <RequestFailure
              message="Could not download HTML"
              error={download.error}
            />
          )}
          <Card size="small">
            <Tabs
              activeKey={tab}
              onChange={setTab}
              items={[
                {
                  key: 'preview',
                  label: 'Preview',
                  children: (
                    <div className="task-stack">
                      <Alert
                        type="info"
                        showIcon
                        message="Preview shows a sanitized DOM. Some styles and resources may be absent."
                      />
                      {preview.isError ? (
                        <RequestFailure
                          message="Could not load preview"
                          error={preview.error}
                          retry={() => void preview.refetch()}
                        />
                      ) : preview.data === undefined ? (
                        <TaskLoading message="Loading preview…" />
                      ) : (
                        <iframe
                          className="snapshot-preview"
                          title="Snapshot preview"
                          srcDoc={preview.data}
                          sandbox=""
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                  ),
                },
                {
                  key: 'source',
                  label: 'HTML Source',
                  children: html.isError ? (
                    <RequestFailure
                      message="Could not load HTML source"
                      error={html.error}
                      retry={() => void html.refetch()}
                    />
                  ) : html.data === undefined ? (
                    <TaskLoading message="Loading HTML source…" />
                  ) : (
                    <Suspense
                      fallback={<TaskLoading message="Loading HTML editor…" />}
                    >
                      <SnapshotSource
                        key={`${sourceId}:${snapshotId}`}
                        html={html.data}
                      />
                    </Suspense>
                  ),
                },
                {
                  key: 'details',
                  label: 'Details',
                  children: <Details details={details.data} />,
                },
              ]}
            />
          </Card>
        </div>
      )}
    </div>
  )
}
