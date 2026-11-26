import OpenInFirefox from './OpenInFirefox'
import type { SnapshotSelectorContext } from './snapshot-api'

export function SnapshotLink({
  sourceId,
  snapshotId,
  selectorContext,
  small = false,
}: {
  sourceId: string | number
  snapshotId: number
  selectorContext?: SnapshotSelectorContext
  small?: boolean
}) {
  const key = [
    sourceId,
    snapshotId,
    selectorContext?.extractionRunId,
    selectorContext?.selectorUuid,
    selectorContext?.selectorVersionUuid,
  ].join(':')
  return (
    <OpenInFirefox
      key={key}
      sourceId={sourceId}
      snapshotId={snapshotId}
      selectorContext={selectorContext}
      small={small}
    />
  )
}
