import { Button, Space } from 'antd'
import { useHref, useLinkClickHandler, useLocation } from 'react-router'
import OpenInFirefox from './OpenInFirefox'
import { snapshotPath, type SnapshotSelectorContext } from './snapshot-api'

export interface SnapshotBack {
  label: string
  state?: unknown
}

export function SnapshotLink({
  sourceId,
  snapshotId,
  back,
  selectorContext,
  small = false,
}: {
  sourceId: string | number
  snapshotId: number
  back: SnapshotBack
  selectorContext?: SnapshotSelectorContext
  small?: boolean
}) {
  const location = useLocation()
  const to = snapshotPath(sourceId, snapshotId)
  const href = useHref(to)
  const onClick = useLinkClickHandler<HTMLAnchorElement>(to, {
    state: {
      selectorContext,
      snapshotBack: {
        to: location.pathname + location.search,
        label: back.label,
        state: back.state ?? location.state,
      },
    },
  })
  return (
    <Space wrap size={6}>
      <Button href={href} onClick={onClick} size={small ? 'small' : undefined}>
        View snapshot
      </Button>
      <OpenInFirefox
        key={`${sourceId}:${snapshotId}:${selectorContext?.extractionRunId ?? ''}`}
        sourceId={sourceId}
        snapshotId={snapshotId}
        selectorContext={selectorContext}
        small={small}
      />
    </Space>
  )
}
