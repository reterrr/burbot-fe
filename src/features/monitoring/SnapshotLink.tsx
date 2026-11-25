import { Button } from 'antd'
import { useHref, useLinkClickHandler, useLocation } from 'react-router'
import { snapshotPath } from './snapshot-api'

export interface SnapshotBack {
  label: string
  state?: unknown
}

export function SnapshotLink({
  sourceId,
  snapshotId,
  back,
  small = false,
}: {
  sourceId: string | number
  snapshotId: number
  back: SnapshotBack
  small?: boolean
}) {
  const location = useLocation()
  const to = snapshotPath(sourceId, snapshotId)
  const href = useHref(to)
  const onClick = useLinkClickHandler<HTMLAnchorElement>(to, {
    state: {
      snapshotBack: {
        to: location.pathname + location.search,
        label: back.label,
        state: back.state ?? location.state,
      },
    },
  })
  return (
    <Button href={href} onClick={onClick} size={small ? 'small' : undefined}>
      View snapshot
    </Button>
  )
}
