import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Modal, Select, Space, Spin } from 'antd'
import { useState } from 'react'
import {
  snapshotBridge,
  snapshotCommandError,
  type SnapshotAgent,
  type SnapshotOpenRequest,
  type SnapshotSelectorContext,
} from './snapshot-api'
import { monitoringQueryKey } from './api'

export default function OpenInFirefox({
  sourceId,
  snapshotId,
  selectorContext,
  small = false,
  primary = false,
  disabled = false,
}: {
  sourceId: number | string
  snapshotId: number | string
  selectorContext?: SnapshotSelectorContext
  small?: boolean
  primary?: boolean
  disabled?: boolean
}) {
  const [visible, setVisible] = useState(false)
  const [agents, setAgents] = useState<SnapshotAgent[]>()
  const [selected, setSelected] = useState<string>()
  const [request, setRequest] = useState<SnapshotOpenRequest>()
  const open = useMutation({ mutationFn: snapshotBridge.open })
  function send(agentId: string) {
    const next = {
      requestId: crypto.randomUUID(),
      sourceId: Number(sourceId),
      snapshotId: Number(snapshotId),
      targetAgentId: agentId,
      selectorContext,
    }
    setRequest(next)
    open.mutate(next)
  }
  const identify = useMutation({
    mutationFn: () => snapshotBridge.agents(Number(sourceId)),
    onSuccess: (choices) => {
      setAgents(choices)
      if (choices.length === 1) send(choices[0].agentId)
    },
  })
  const commandId = open.data?.commandId
  const status = useQuery({
    queryKey: [...monitoringQueryKey, 'snapshot-command', commandId],
    enabled:
      Boolean(commandId) &&
      (open.data?.state === 'pending' || open.data?.state === 'claimed'),
    queryFn: ({ signal }) => snapshotBridge.status(commandId!, signal),
    refetchInterval: (query) => {
      const command = query.state.data ?? open.data
      return command?.state === 'pending' || command?.state === 'claimed'
        ? 1_500
        : false
    },
    refetchIntervalInBackground: true,
    retry: false,
  })
  const command = status.data ?? open.data
  const waiting = command?.state === 'pending' || command?.state === 'claimed'

  function start() {
    setAgents(undefined)
    setSelected(undefined)
    setRequest(undefined)
    open.reset()
    identify.mutate()
  }

  return (
    <>
      <Button
        type={primary ? 'primary' : 'default'}
        size={small ? 'small' : undefined}
        disabled={disabled}
        onClick={() => {
          setVisible(true)
          if (
            !command &&
            !identify.isPending &&
            !open.isPending &&
            !agents &&
            !identify.isError
          )
            start()
        }}
      >
        Open in Firefox
      </Button>
      <Modal
        title={`Open Snapshot #${snapshotId} in Firefox`}
        open={visible}
        onCancel={() => setVisible(false)}
        footer={null}
      >
        <div className="task-stack" aria-live="polite">
          {(identify.isPending || open.isPending) && (
            <Space>
              <Spin size="small" />
              Connecting to Firefox agent…
            </Space>
          )}
          {identify.isError && (
            <Alert
              type="error"
              showIcon
              message="Could not find Firefox agents"
              description={identify.error.message}
            />
          )}
          {!identify.isPending && agents?.length === 0 && (
            <Alert
              type="warning"
              showIcon
              message="Firefox extension offline"
              description="No eligible Firefox agent is connected for this source."
            />
          )}
          {agents && agents.length > 1 && !open.isPending && !request && (
            <Space wrap>
              <Select
                aria-label="Firefox agent"
                virtual={false}
                placeholder="Choose a Firefox agent"
                style={{ minWidth: 225 }}
                value={selected}
                onChange={setSelected}
                options={agents.map((agent) => ({
                  value: agent.agentId,
                  label: agent.name,
                }))}
              />
              <Button
                type="primary"
                disabled={!selected}
                onClick={() => selected && send(selected)}
              >
                Send command
              </Button>
            </Space>
          )}
          {open.isError && (
            <Alert
              type="error"
              showIcon
              message="Could not send the snapshot command"
              description={open.error.message}
            />
          )}
          {waiting && (
            <Space>
              <Spin size="small" />
              {command.state === 'claimed'
                ? 'Firefox is opening the snapshot…'
                : 'Waiting for Firefox to receive the command…'}
            </Space>
          )}
          {waiting && status.isError && (
            <Alert
              type="warning"
              showIcon
              message="Could not check delivery status. Retrying…"
            />
          )}
          {command?.state === 'opened' && (
            <Alert type="success" showIcon message="Opened in Firefox" />
          )}
          {command?.state === 'failed' && (
            <Alert
              type="error"
              showIcon
              message="Firefox could not open the snapshot"
              description={snapshotCommandError(command.errorCode)}
            />
          )}
          {command?.state === 'expired' && (
            <Alert
              type="warning"
              showIcon
              message="The snapshot command expired"
              description="Firefox did not confirm opening before the command expired."
            />
          )}
          {open.isError && request && (
            <Button onClick={() => open.mutate(request)}>Retry delivery</Button>
          )}
          {!identify.isPending &&
            !open.isPending &&
            !waiting &&
            (identify.isError ||
              open.isError ||
              agents?.length === 0 ||
              command) && (
              <Button onClick={start}>
                {command?.state === 'opened'
                  ? 'Open another tab'
                  : 'Find Firefox agents again'}
              </Button>
            )}
        </div>
      </Modal>
    </>
  )
}
