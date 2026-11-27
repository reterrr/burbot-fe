import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Modal, Select, Space, Typography } from 'antd'
import { useState } from 'react'
import { TaskApiError } from '../tasks/api/task-client'
import { monitoringQueryKey } from './api'
import {
  snapshotBridge,
  snapshotCommandError,
  type SnapshotCommand,
  type SnapshotSelectorContext,
} from './snapshot-api'

function awaitingFirefox(command: SnapshotCommand | undefined) {
  return command?.state === 'pending' || command?.state === 'claimed'
}

export default function OpenInFirefox({
  sourceId,
  snapshotId,
  checkId,
  selectorContext,
  small = false,
}: {
  sourceId: number | string
  snapshotId: number
  checkId?: string
  selectorContext?: SnapshotSelectorContext
  small?: boolean
}) {
  const [choosing, setChoosing] = useState(false)
  const [selected, setSelected] = useState<string>()
  const identify = useMutation({
    mutationFn: () => snapshotBridge.agents(Number(sourceId)),
    networkMode: 'always',
  })
  const open = useMutation({
    mutationFn: snapshotBridge.open,
    networkMode: 'always',
  })
  const commandId = open.data?.commandId
  const status = useQuery({
    queryKey: [...monitoringQueryKey, 'snapshot-command', commandId],
    enabled: Boolean(commandId) && awaitingFirefox(open.data),
    queryFn: ({ signal }) => snapshotBridge.status(commandId!, signal),
    refetchInterval: ({ state }) =>
      state.status !== 'error' && awaitingFirefox(state.data ?? open.data)
        ? 1_500
        : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    networkMode: 'always',
    retry: false,
  })
  const command = status.data ?? open.data
  const waiting = awaitingFirefox(command)
  const statusFailed = waiting && status.isError
  const connecting = identify.isPending || open.isPending
  const busy = connecting || (waiting && (!statusFailed || status.isFetching))
  const actionLabel = statusFailed ? 'Retry status' : `Open snapshot #${snapshotId}`

  function send(agentId: string) {
    setChoosing(false)
    open.mutate({
      requestId: crypto.randomUUID(),
      sourceId: Number(sourceId),
      snapshotId,
      checkId,
      targetAgentId: agentId,
      selectorContext,
    })
  }

  function start() {
    if (statusFailed) {
      void status.refetch()
      return
    }
    if (
      open.isError &&
      open.variables &&
      (!(open.error instanceof TaskApiError) || open.error.statusCode >= 500)
    ) {
      // A lost response may have queued the command. Reuse its idempotency key.
      open.mutate(open.variables)
      return
    }
    setSelected(undefined)
    open.reset()
    identify.mutate(undefined, {
      onSuccess(agents) {
        if (agents.length === 1) send(agents[0].agentId)
        if (agents.length > 1) setChoosing(true)
      },
    })
  }

  let feedback: string | undefined
  let tone: 'secondary' | 'success' | 'warning' | 'danger' = 'secondary'
  if (connecting) {
    feedback = 'Connecting to Firefox agent…'
  } else if (identify.isError) {
    feedback = `Could not find Firefox agents. ${identify.error.message}`
    tone = 'danger'
  } else if (identify.data?.length === 0) {
    feedback = 'Firefox extension offline. Connect an eligible agent and try again.'
    tone = 'warning'
  } else if (open.isError) {
    feedback = `Could not send the snapshot command. ${open.error.message}`
    tone = 'danger'
  } else if (statusFailed && !status.isFetching) {
    feedback = `Could not check snapshot delivery. ${status.error?.message ?? ''}`
    tone = 'warning'
  } else if (waiting) {
    feedback =
      command?.state === 'claimed'
        ? 'Firefox is opening the snapshot…'
        : 'Waiting for Firefox to receive the command…'
  } else if (command?.state === 'opened') {
    feedback = 'Opened in Firefox'
    tone = 'success'
  } else if (command?.state === 'failed') {
    feedback = snapshotCommandError(command.errorCode)
    tone = 'danger'
  } else if (command?.state === 'expired') {
    feedback = 'The snapshot command expired. Try opening it again.'
    tone = 'warning'
  }

  return (
    <>
      <Space direction="vertical" size={4}>
        <Button
          size={small ? 'small' : undefined}
          aria-label={actionLabel}
          disabled={busy}
          loading={busy}
          onClick={start}
        >
          {actionLabel}
        </Button>
        {feedback && (
          <Typography.Text role="status" type={tone}>
            {feedback}
          </Typography.Text>
        )}
      </Space>
      <Modal
        title={`Choose a Firefox agent for snapshot #${snapshotId}`}
        open={choosing}
        onCancel={() => setChoosing(false)}
        okText="Send command"
        okButtonProps={{ disabled: !selected }}
        onOk={() => selected && send(selected)}
      >
        <Select
          aria-label="Firefox agent"
          virtual={false}
          placeholder="Choose a Firefox agent"
          style={{ width: '100%' }}
          value={selected}
          onChange={setSelected}
          options={identify.data?.map((agent) => ({
            value: agent.agentId,
            label: agent.name,
          }))}
        />
      </Modal>
    </>
  )
}
