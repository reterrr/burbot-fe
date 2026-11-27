import { Space, Tag, Typography } from 'antd'
import type { SnapshotArchive } from '../tasks/api/review-contracts'
import OpenInFirefox from './OpenInFirefox'
import type { SnapshotSelectorContext } from './snapshot-api'

export function SnapshotLink({
  sourceId,
  snapshotId,
  checkId,
  archive,
  selectorContext,
  small = false,
}: {
  sourceId: string | number
  snapshotId: number
  checkId?: string
  archive?: SnapshotArchive | null
  selectorContext?: SnapshotSelectorContext
  small?: boolean
}) {
  const key = [
    sourceId,
    snapshotId,
    checkId,
    selectorContext?.extractionRunId,
    selectorContext?.selectorUuid,
    selectorContext?.selectorVersionUuid,
  ].join(':')
  return (
    <Space direction="vertical" size={4}>
      <OpenInFirefox
        key={key}
        sourceId={sourceId}
        snapshotId={snapshotId}
        checkId={checkId}
        selectorContext={selectorContext}
        small={small}
      />
      {archive && <ArchiveStatus archive={archive} />}
    </Space>
  )
}

const failureMessages = {
  capture_unavailable: 'Firefox could not prepare the visual archive.',
  upload_failed: 'Archive upload failed.',
  agent_incomplete: 'Firefox did not finish the visual archive.',
  capture_mismatch: 'The archive did not match the recorded capture.',
}

function ArchiveStatus({ archive }: { archive: SnapshotArchive }) {
  if (archive.status === 'minimal') return <Tag>Minimal evidence</Tag>
  if (archive.status === 'failed')
    return (
      <Space wrap size={4}>
        <Tag color="orange">Full archive unavailable</Tag>
        {archive.failure && (
          <Typography.Text type="secondary">{failureMessages[archive.failure]}</Typography.Text>
        )}
      </Space>
    )
  return (
    <Space wrap size={4}>
      <Tag color={archive.status === 'partial' ? 'gold' : 'blue'}>
        {archive.status === 'partial' ? 'Partial full archive' : 'Full archive'}
      </Tag>
      <Typography.Text type="secondary">
        {archive.captured ?? 0} captured · {archive.missing ?? 0} missing · {archive.truncated ?? 0} truncated
      </Typography.Text>
    </Space>
  )
}
