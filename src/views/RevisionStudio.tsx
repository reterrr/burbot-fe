import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  ChevronRight,
  FileCode2,
  GitBranch,
  History,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Table2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '../lib/monaco'
import { business, BusinessApiError } from '../api/business'
import type {
  BusinessModel,
  BusinessModelRevisionListResponse,
  ExecutionResult,
  Program,
  SchemaChangeResponse,
  SchemaRegisterResponse,
} from '../api/models'
import {
  addEntityToSource,
  createDefaultSchemaSource,
  editorLocation,
  formatSchemaSource,
  getSchemaOutline,
  migrateLegacyDraft,
  schemaToSource,
} from '../lib/schema'
import { SCHEMA_LANGUAGE_ID } from '../lib/schema-language'
import type { SchemaProblem } from '../lib/sema'

interface RevisionStudioProps {
  models: BusinessModel[]
  selectedModelId: number | null
  onModelIdChange: (id: number | null) => void
  onApplied: () => void
}
type InspectorTab = 'changes' | 'problems' | 'revisions'
const draftStorageKey = (id: number | null) =>
  `burbot:program-draft:v2:${id ?? 'unbound'}`

function readDraft(id: number | null): string | null {
  try {
    const current = localStorage.getItem(draftStorageKey(id))
    if (current !== null) return current
    for (const key of [
      `burbot:schema-draft:python-v1:${id ?? 'unbound'}`,
      `burbot:schema-draft:${id ?? 'unbound'}`,
    ]) {
      const old = localStorage.getItem(key)
      if (old !== null) return migrateLegacyDraft(old)
    }
  } catch {
    /* The API workflow also works without local storage. */
  }
  return null
}

function diagnostic(error: unknown, source: string): SchemaProblem | null {
  if (
    !(error instanceof BusinessApiError) ||
    typeof error.data !== 'object' ||
    !error.data
  )
    return null
  const detail = (
    error.data as { detail?: { location?: Partial<SchemaProblem['location']> } }
  ).detail
  const location = detail?.location
  if (
    !location ||
    !Number.isInteger(location.line) ||
    !Number.isInteger(location.column)
  )
    return null
  return {
    message: error.message,
    location: editorLocation(
      {
        line: location.line!,
        column: location.column!,
        end_line: location.end_line ?? location.line!,
        end_column: location.end_column ?? location.column! + 1,
      },
      source,
    ),
  }
}
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'The request failed.'

export function RevisionStudio({
  models,
  selectedModelId,
  onModelIdChange,
  onApplied,
}: RevisionStudioProps) {
  const [localDraft] = useState(() => readDraft(selectedModelId))
  const [source, setSource] = useState(
    () =>
      localDraft ??
      (selectedModelId === null ? createDefaultSchemaSource() : ''),
  )
  const [ready, setReady] = useState(
    localDraft !== null || selectedModelId === null,
  )
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [reason, setReason] = useState('')
  const [query, setQuery] = useState('')
  const [saved, setSaved] = useState(false)
  const [compiled, setCompiled] = useState<{
    source: string
    program: Program
  } | null>(null)
  const [compileState, setCompileState] = useState('waiting')
  const [compilerError, setCompilerError] = useState<string | null>(null)
  const [problem, setProblem] = useState<SchemaProblem | null>(null)
  const [preview, setPreview] = useState<{
    source: string
    changes: SchemaChangeResponse[]
  } | null>(null)
  const [registration, setRegistration] =
    useState<SchemaRegisterResponse | null>(null)
  const [execution, setExecution] = useState<ExecutionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [tab, setTab] = useState<InspectorTab>('changes')
  const [history, setHistory] =
    useState<BusinessModelRevisionListResponse | null>(null)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)
  const outline = useMemo(() => getSchemaOutline(source), [source])
  const filtered = outline.filter((entity) =>
    `${entity.name} ${entity.fields.map((field) => field.name).join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  const selectedModel = models.find((model) => model.id === selectedModelId)
  const plan = compiled?.source === source ? compiled.program : null
  const changes = preview?.source === source ? preview.changes : null
  const canPreview = ready && selectedModelId !== null && !!plan && !pending
  const canApply = canPreview && changes !== null
  const refreshHistory = () => {
    setHistory(null)
    setHistoryError(null)
    setHistoryRefresh((value) => value + 1)
  }
  const changeHistoryPage = (offset: number) => {
    setHistory(null)
    setHistoryError(null)
    setHistoryOffset(offset)
  }

  useEffect(() => {
    if (localDraft !== null || selectedModelId === null) return
    const controller = new AbortController()
    business
      .schema(selectedModelId, controller.signal)
      .then((schema) => {
        if (controller.signal.aborted) return
        setSource(
          schema.entities?.length || schema.enums?.length
            ? schemaToSource(schema)
            : createDefaultSchemaSource(),
        )
        setReady(true)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(`Could not load the saved schema. ${errorMessage(failure)}`)
      })
    return () => controller.abort()
  }, [selectedModelId, localDraft, loadAttempt])

  useEffect(() => {
    if (!ready) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setCompileState('compiling')
      try {
        const program = await business.compile(
          selectedModelId,
          source,
          controller.signal,
        )
        if (!controller.signal.aborted) {
          setCompiled({ source, program })
          setCompileState('valid')
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setCompiled(null)
          setCompileState('error')
          setCompilerError(errorMessage(failure))
          setProblem(diagnostic(failure, source))
        }
      }
    }, 500)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [source, ready, selectedModelId])

  useEffect(() => {
    if (selectedModelId === null) return
    const controller = new AbortController()
    business
      .revisions(selectedModelId, historyOffset, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setHistory(value)
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setHistoryError(errorMessage(failure))
      })
    return () => controller.abort()
  }, [selectedModelId, historyOffset, historyRefresh])

  const updateMarkers = useCallback(() => {
    const model = editorRef.current?.getModel(),
      monaco = monacoRef.current
    if (!model || !monaco) return
    monaco.editor.setModelMarkers(
      model,
      'burbot',
      problem
        ? [
            {
              message: problem.message,
              severity: monaco.MarkerSeverity.Error,
              source: 'Burbot API',
              startLineNumber: problem.location.line,
              startColumn: problem.location.column,
              endLineNumber: problem.location.end_line,
              endColumn: Math.max(
                problem.location.column + 1,
                problem.location.end_column,
              ),
            },
          ]
        : [],
    )
  }, [problem])
  useEffect(updateMarkers, [updateMarkers])

  const saveDraft = useCallback(() => {
    if (!ready) return
    try {
      localStorage.setItem(draftStorageKey(selectedModelId), source)
      setSaved(true)
    } catch {
      setError(
        'Could not save the draft. Browser storage is unavailable or full.',
      )
    }
  }, [ready, selectedModelId, source])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveDraft()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saveDraft])

  const updateSource = (value: string) => {
    if (value !== source) {
      setCompileState('waiting')
      setCompilerError(null)
      setProblem(null)
    }
    setSource(value)
    setSaved(false)
    setPreview(null)
    setExecution(null)
    setRegistration(null)
    setError(null)
    // Persist on edit so changing views or models cannot discard a working draft.
    try {
      localStorage.setItem(draftStorageKey(selectedModelId), value)
    } catch {
      setError(
        'Could not save the draft. Keep this tab open or copy your source before leaving.',
      )
    }
  }
  const previewChanges = async () => {
    if (!canPreview || selectedModelId === null || !plan) return
    setPending('preview')
    setError(null)
    setTab('changes')
    try {
      setPreview({
        source,
        changes: await business.changes(selectedModelId, plan.schema),
      })
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setPending(null)
    }
  }
  const apply = async (mode: 'register' | 'execute') => {
    if (!canApply || selectedModelId === null || !plan) return
    setPending(mode)
    setError(null)
    setRegistration(null)
    setExecution(null)
    setTab('changes')
    try {
      if (mode === 'register')
        setRegistration(
          await business.register(selectedModelId, plan.schema, reason.trim()),
        )
      else
        setExecution(
          await business.execute(selectedModelId, source, reason.trim()),
        )
      saveDraft()
      setPreview(null)
      setHistoryOffset(0)
      refreshHistory()
      onApplied()
    } catch (failure) {
      setError(errorMessage(failure))
      setProblem(diagnostic(failure, source))
      // A concurrent schema edit may have invalidated the preview.
      setPreview(null)
    } finally {
      setPending(null)
    }
  }
  const loadSchema = async (revisionId?: number) => {
    if (!ready || selectedModelId === null || pending) return
    if (
      !window.confirm(
        'Replace the working draft with saved schema declarations? Named object seeds are not part of schema revisions.',
      )
    )
      return
    setPending('load')
    setError(null)
    try {
      const schema =
        revisionId === undefined
          ? await business.schema(selectedModelId)
          : (await business.revision(selectedModelId, revisionId)).schema
      updateSource(schemaToSource(schema))
      setReady(true)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setPending(null)
    }
  }
  const beforeMount: BeforeMount = (monaco) =>
    monaco.editor.defineTheme('burbot-night', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'string', foreground: 'A7D7C5' },
        { token: 'keyword', foreground: 'D6A6F2' },
      ],
      colors: {
        'editor.background': '#101217',
        'editor.foreground': '#D8DCE7',
        'editorLineNumber.foreground': '#4F5668',
        'editorCursor.foreground': '#8B7CFF',
      },
    })

  return (
    <div className="revision-workspace">
      <div className="revision-commandbar">
        <div className="breadcrumbs revision-breadcrumbs">
          <GitBranch size={14} />
          <span>{selectedModel?.name ?? 'Unbound draft'}</span>
          <ChevronRight size={13} />
          <strong>Program studio</strong>
        </div>
        <div className="revision-actions">
          <select
            className="workspace-select"
            aria-label="Business model"
            value={selectedModelId ?? ''}
            disabled={!!pending}
            onChange={(event) => {
              saveDraft()
              onModelIdChange(
                event.target.value ? Number(event.target.value) : null,
              )
            }}
          >
            <option value="">Unbound draft</option>
            {models.map((model) => (
              <option key={model.id} value={model.id!}>
                {model.name}
              </option>
            ))}
          </select>
          <button
            className="secondary-button"
            onClick={saveDraft}
            disabled={!ready}
          >
            <Save size={14} />
            Save draft
          </button>
          <button
            className="secondary-button"
            onClick={() => void previewChanges()}
            disabled={!canPreview}
          >
            {pending === 'preview' ? (
              <Loader2 className="spin" size={14} />
            ) : (
              <Search size={14} />
            )}
            Preview changes
          </button>
          <button
            className="primary-button"
            onClick={() => void apply('execute')}
            disabled={!canApply}
          >
            {pending === 'execute' ? (
              <Loader2 className="spin" size={14} />
            ) : (
              <Play size={14} />
            )}
            Execute program
          </button>
        </div>
      </div>
      <div className="studio-grid">
        <aside
          className="schema-explorer explorer-pane"
          aria-label="Schema explorer"
        >
          <div className="pane-title-row">
            <span>EXPLORER</span>
            <button
              className="icon-button"
              aria-label="Add entity"
              disabled={!ready || !!pending}
              onClick={() => updateSource(addEntityToSource(source))}
            >
              <Plus size={15} />
            </button>
          </div>
          <label className="explorer-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find entity or field"
              aria-label="Find schema item"
            />
          </label>
          <div className="schema-file-row is-active">
            <FileCode2 size={15} />
            <span>burbot-program.py</span>
          </div>
          <div className="schema-outline">
            {filtered.map((entity) => (
              <details className="program-outline" key={entity.name} open>
                <summary>
                  <Table2 size={14} />
                  {entity.name}
                  <small>{entity.kind}</small>
                </summary>
                {entity.fields.map((field) => (
                  <button
                    key={field.name}
                    onClick={() => {
                      editorRef.current?.revealLineInCenter(field.location.line)
                      editorRef.current?.setPosition({
                        lineNumber: field.location.line,
                        column: 5,
                      })
                      editorRef.current?.focus()
                    }}
                  >
                    <span>{field.name}</span>
                    <small>{field.type}</small>
                  </button>
                ))}
              </details>
            ))}
          </div>
          <div className="program-help">
            <strong>Persistent identity</strong>
            <p>
              Keep a field’s persistent_key when renaming it. To rename an
              entity, preserve its compiled tablename.
            </p>
            <button
              className="secondary-button"
              disabled={!ready || selectedModelId === null || !!pending}
              onClick={() => void loadSchema()}
            >
              <RefreshCw size={13} />
              Load current schema
            </button>
          </div>
        </aside>
        <section className="editor-pane" aria-label="Program editor">
          <div className="editor-tabs">
            <div className="editor-tab is-active">
              <FileCode2 size={14} />
              burbot-program.py
            </div>
            <div className="editor-tools">
              <button
                disabled={!ready || !!pending}
                onClick={() => {
                  try {
                    updateSource(formatSchemaSource(source))
                  } catch (failure) {
                    setError(errorMessage(failure))
                  }
                }}
              >
                <Braces size={14} />
                Format
              </button>
            </div>
          </div>
          <div className="editor-context-bar">
            <span>
              {outline.filter((entity) => entity.kind === 'entity').length}{' '}
              entities
            </span>
            <span>·</span>
            <span>
              {outline.reduce((sum, entity) => sum + entity.fields.length, 0)}{' '}
              fields
            </span>
            <span className="context-spacer" />
            <span>{plan?.objects?.length ?? 0} named objects</span>
          </div>
          <div className="monaco-host">
            {ready ? (
              <Editor
                path={`file:///models/${selectedModelId ?? 'unbound'}/burbot-program.py`}
                language={SCHEMA_LANGUAGE_ID}
                theme="burbot-night"
                value={source}
                beforeMount={beforeMount}
                onMount={(editor, monaco) => {
                  editorRef.current = editor
                  monacoRef.current = monaco
                  updateMarkers()
                }}
                onChange={(value) => updateSource(value ?? '')}
                options={{
                  readOnly: !!pending,
                  automaticLayout: true,
                  fontSize: 13,
                  lineHeight: 21,
                  minimap: { enabled: false },
                  padding: { top: 14 },
                  scrollBeyondLastLine: false,
                }}
              />
            ) : (
              <div className="workspace-loading">
                {error ? (
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setError(null)
                      setLoadAttempt((value) => value + 1)
                    }}
                  >
                    Retry loading schema
                  </button>
                ) : (
                  <>
                    <Loader2 className="spin" size={16} />
                    Loading saved schema…
                  </>
                )}
              </div>
            )}
          </div>
          <div className="editor-statusbar">
            <span>
              {compileState === 'valid' && plan
                ? '✓ Backend validated'
                : compileState === 'error'
                  ? 'Compilation failed'
                  : 'Validating…'}
            </span>
            <span>{saved ? 'Draft saved' : 'Local draft'} · Burbot Python</span>
          </div>
        </section>
        <aside className="inspector-pane" aria-label="Program inspector">
          <div className="inspector-tabs">
            {(['changes', 'problems', 'revisions'] as const).map((item) => (
              <button
                key={item}
                className={tab === item ? 'is-active' : ''}
                onClick={() => setTab(item)}
              >
                {item.toUpperCase()}
                {item === 'revisions' && history ? (
                  <span>{history.total}</span>
                ) : item === 'problems' && compilerError ? (
                  <span className="problem-badge">1</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="inspector-content">
            {error && (
              <div className="registration-result error-result" role="alert">
                <AlertTriangle size={16} />
                <p>{error}</p>
              </div>
            )}
            {tab === 'changes' ? (
              <>
                <div className="revision-summary">
                  <GitBranch size={18} />
                  <div>
                    <span>CHANGE PREVIEW</span>
                    <strong>
                      {changes === null
                        ? 'Preview before applying'
                        : `${changes.length} schema changes`}
                    </strong>
                  </div>
                </div>
                {registration && (
                  <div
                    className="registration-result success-result"
                    role="status"
                  >
                    <CheckCircle2 size={16} />
                    <p>
                      {registration.message}
                      {registration.revision_id
                        ? ` · Revision #${registration.revision_id}`
                        : ''}
                    </p>
                  </div>
                )}
                {execution && (
                  <div
                    className="registration-result success-result"
                    role="status"
                  >
                    <CheckCircle2 size={16} />
                    <div>
                      <strong>Program executed</strong>
                      <p>
                        {execution.schema_changed
                          ? `Revision #${execution.revision_id}`
                          : 'Schema unchanged'}{' '}
                        · Code v{execution.code_version ?? '—'}
                      </p>
                      <p>
                        {execution.created?.length ?? 0} created ·{' '}
                        {execution.updated?.length ?? 0} updated
                      </p>
                      {Object.entries(execution.objects ?? {}).map(
                        ([name, id]) => (
                          <p key={name}>
                            {name} → object #{id}
                          </p>
                        ),
                      )}
                    </div>
                  </div>
                )}
                {changes !== null && (
                  <div className="change-list">
                    {changes.map((change, index) => (
                      <div
                        className={`change-item change-${change.action === 'delete' ? 'danger' : change.action === 'create' ? 'positive' : 'warning'}`}
                        key={index}
                      >
                        <span className="change-glyph">
                          {change.action === 'delete' ? '−' : '+'}
                        </span>
                        <div>
                          <strong>
                            {change.entity}
                            {change.field ? `.${change.field}` : ''}
                          </strong>
                          <span>
                            {change.action} {change.resource}
                          </span>
                        </div>
                      </div>
                    ))}
                    {!changes.length && (
                      <p className="panel-note">
                        Definitions are up to date. Execute can still apply
                        named objects.
                      </p>
                    )}
                  </div>
                )}
                {plan && (
                  <div className="program-help">
                    <strong>{plan.objects?.length ?? 0} named objects</strong>
                    <p>
                      Execution order: {plan.seed_order?.join(' → ') || 'none'}
                    </p>
                    <details>
                      <summary>Compiled program</summary>
                      <pre className="json-preview">
                        {JSON.stringify(plan, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
                <div className="revision-message">
                  <label htmlFor="revision-reason">
                    REASON <span>OPTIONAL</span>
                  </label>
                  <textarea
                    id="revision-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    placeholder="Why is this changing?"
                  />
                </div>
                <div className="program-help">
                  <p>
                    Execute atomically applies the schema and upserts named
                    objects. Register schema applies definitions only.
                  </p>
                  <button
                    className="secondary-button"
                    disabled={!canApply}
                    onClick={() => void apply('register')}
                  >
                    Register schema only
                  </button>
                  {!canApply && (
                    <p>
                      {selectedModelId === null
                        ? 'Select a model to preview and apply.'
                        : !plan
                          ? 'Resolve compilation errors before previewing.'
                          : 'Preview the current draft to enable apply actions.'}
                    </p>
                  )}
                </div>
              </>
            ) : tab === 'problems' ? (
              <div className="program-help">
                {compilerError ? (
                  <button
                    className="problem-row"
                    onClick={() => {
                      if (problem) {
                        editorRef.current?.revealLineInCenter(
                          problem.location.line,
                        )
                        editorRef.current?.setPosition({
                          lineNumber: problem.location.line,
                          column: problem.location.column,
                        })
                        editorRef.current?.focus()
                      }
                    }}
                  >
                    <AlertTriangle size={14} />
                    <div>
                      <strong>{compilerError}</strong>
                      {problem && (
                        <span>
                          Line {problem.location.line}, column{' '}
                          {problem.location.column}
                        </span>
                      )}
                    </div>
                  </button>
                ) : (
                  <>
                    <CheckCircle2 size={24} />
                    <h3>
                      {plan
                        ? 'Backend validation passed'
                        : 'Validating the draft…'}
                    </h3>
                    <p>
                      The server resolves enums, references, identities,
                      constraints, and seed dependencies.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="program-help">
                <div className="data-heading">
                  <History size={16} />
                  <strong>Schema revisions</strong>
                  <button
                    className="icon-button"
                    aria-label="Refresh revisions"
                    onClick={refreshHistory}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                {historyError && <p role="alert">{historyError}</p>}
                {history?.items.map((revision) => (
                  <div className="revision-history-item" key={revision.id}>
                    <strong>Revision #{revision.id}</strong>
                    <p>{revision.reason || 'No reason provided'}</p>
                    <small>
                      {new Date(revision.created_at).toLocaleString()}
                    </small>
                    <button
                      className="secondary-button"
                      disabled={!ready || !!pending}
                      onClick={() => void loadSchema(revision.id)}
                    >
                      Load into draft
                    </button>
                  </div>
                ))}
                {history?.total === 0 && <p>No schema revisions yet.</p>}
                {selectedModelId === null && (
                  <p>Select a business model to view revisions.</p>
                )}
                <div className="pagination">
                  <button
                    disabled={!historyOffset || !!pending}
                    onClick={() =>
                      changeHistoryPage(Math.max(0, historyOffset - 20))
                    }
                  >
                    Previous
                  </button>
                  <button
                    disabled={
                      !history ||
                      historyOffset + history.items.length >= history.total ||
                      !!pending
                    }
                    onClick={() => changeHistoryPage(historyOffset + 20)}
                  >
                    Next
                  </button>
                </div>
                <p>
                  Schema revisions contain declarations. Your local draft
                  retains named object seeds.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
