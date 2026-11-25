import Editor from '@monaco-editor/react'
import { Button, Input, Select, Space, Typography, message } from 'antd'
import type { editor } from 'monaco-editor'
import { useEffect, useMemo, useState } from 'react'
import '../../lib/monaco'
import { findSnapshotMatches, type SnapshotSearch } from './snapshot-search'

const modes = [
  { value: 'text', label: 'Text' },
  { value: 'class', label: 'CSS class' },
  { value: 'id', label: 'HTML ID' },
]

export default function SnapshotSource({ html }: { html: string }) {
  const [monaco, setMonaco] = useState<editor.IStandaloneCodeEditor | null>(
    null,
  )
  const [mode, setMode] = useState<SnapshotSearch>('text')
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [hasSelection, setHasSelection] = useState(false)
  const [toast, toastContext] = message.useMessage()
  const source = useMemo(
    () => monaco?.getModel()?.getValue() ?? html,
    [monaco, html],
  )
  const matches = useMemo(
    () => findSnapshotMatches(source, query, mode),
    [source, query, mode],
  )
  const selected = useMemo(() => matches.at(index), [matches, index])
  const count = matches.count

  useEffect(() => {
    if (!monaco) return
    const subscription = monaco.onDidChangeCursorSelection(({ selection }) =>
      setHasSelection(!selection.isEmpty()),
    )
    return () => subscription.dispose()
  }, [monaco])

  useEffect(() => {
    const model = monaco?.getModel()
    if (!monaco || !model || !selected) return
    const start = model.getPositionAt(selected.start)
    const end = model.getPositionAt(selected.end)
    const range = {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    }
    monaco.setSelection(range)
    monaco.revealRangeInCenter(range)
  }, [monaco, selected])

  function moveMatch(step: number) {
    if (count) setIndex((position) => (position + step + count) % count)
  }

  async function copyHtml(selectionOnly: boolean) {
    const selection = monaco?.getSelection()
    const text = selectionOnly
      ? selection && monaco?.getModel()?.getValueInRange(selection)
      : html
    if (text == null) return
    try {
      await navigator.clipboard.writeText(text)
      void toast.success('HTML copied')
    } catch {
      void toast.error('Could not copy HTML')
    }
  }

  return (
    <div className="task-stack">
      {toastContext}
      <div className="snapshot-toolbar">
        <Select
          aria-label="Search HTML by"
          virtual={false}
          value={mode}
          options={modes}
          onChange={(value) => {
            setMode(value)
            setIndex(0)
          }}
        />
        <Input
          aria-label="Search saved HTML"
          placeholder="Search saved HTML"
          allowClear
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIndex(0)
          }}
          onPressEnter={(event) => moveMatch(event.shiftKey ? -1 : 1)}
        />
        <Space wrap>
          <Typography.Text role="status" type="secondary">
            {query &&
              (count
                ? `${index + 1} of ${count} ${count === 1 ? 'match' : 'matches'}`
                : 'No matches')}
          </Typography.Text>
          <Button disabled={count < 2} onClick={() => moveMatch(-1)}>
            Previous match
          </Button>
          <Button disabled={count < 2} onClick={() => moveMatch(1)}>
            Next match
          </Button>
        </Space>
        <Space wrap>
          <Button onClick={() => void copyHtml(false)}>Copy HTML</Button>
          <Button disabled={!hasSelection} onClick={() => void copyHtml(true)}>
            Copy selected HTML
          </Button>
        </Space>
      </div>
      <div className="snapshot-editor">
        <Editor
          value={html}
          language="html"
          theme="vs-dark"
          onMount={setMonaco}
          options={{
            ariaLabel: 'Saved HTML source',
            readOnly: true,
            domReadOnly: true,
            links: false,
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  )
}
