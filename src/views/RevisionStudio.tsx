import Editor, {
  type BeforeMount,
  type OnMount,
  type OnValidate,
} from '@monaco-editor/react'
import {
  AlertTriangle,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Clock3,
  Code2,
  FileJson,
  GitBranch,
  GitCommitHorizontal,
  Hash,
  History,
  KeyRound,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Table2,
  WandSparkles,
  XCircle,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import '../lib/monaco'
import {
  diffBusinessSchemaApiV1BusinessModelsModelIdSchemaDiffPost,
  registerBusinessSchemaApiV1BusinessModelsModelIdSchemaPut,
} from '../api/generated/business/business'
import type {
  BusinessModel,
  SchemaChangeResponse,
  SchemaRegisterResponse,
} from '../api/models'
import { formatApiError } from '../lib/api-error'
import {
  addEntityToSource,
  BURBOT_EDITOR_SCHEMA,
  DEFAULT_SCHEMA_SOURCE,
  formatSchemaSource,
  getSchemaOutline,
  parseSchemaSource,
} from '../lib/schema'

interface RevisionStudioProps {
  models: BusinessModel[]
  selectedModelId: number | null
  onModelIdChange: (modelId: number | null) => void
}

interface EditorProblem {
  message: string
  line: number
  column: number
  severity: number
}

type InspectorTab = 'changes' | 'problems'
type PendingAction = 'preview' | 'register' | null

function draftStorageKey(modelId: number | null): string {
  return `burbot:schema-draft:${modelId ?? 'unbound'}`
}

function readDraft(modelId: number | null): string {
  try {
    return localStorage.getItem(draftStorageKey(modelId)) ?? DEFAULT_SCHEMA_SOURCE
  } catch {
    return DEFAULT_SCHEMA_SOURCE
  }
}

function isDestructiveAction(action: string): boolean {
  return /(delete|drop|remove|retire)/i.test(action)
}

function changeKind(action: string): 'positive' | 'warning' | 'danger' | 'neutral' {
  if (isDestructiveAction(action)) return 'danger'
  if (/(update|alter|change|rename)/i.test(action)) return 'warning'
  if (/(add|create|new)/i.test(action)) return 'positive'
  return 'neutral'
}

function actionGlyph(action: string) {
  const kind = changeKind(action)
  if (kind === 'positive') return '+'
  if (kind === 'danger') return '−'
  if (kind === 'warning') return '~'
  return '•'
}

export function RevisionStudio({
  models,
  selectedModelId,
  onModelIdChange,
}: RevisionStudioProps) {
  const [source, setSource] = useState(() => readDraft(selectedModelId))
  const [modelIdInput, setModelIdInput] = useState(
    selectedModelId?.toString() ?? '',
  )
  const [reason, setReason] = useState('')
  const [schemaQuery, setSchemaQuery] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [changes, setChanges] = useState<SchemaChangeResponse[]>([])
  const [hasPreviewed, setHasPreviewed] = useState(false)
  const [registration, setRegistration] =
    useState<SchemaRegisterResponse | null>(null)
  const [problems, setProblems] = useState<EditorProblem[]>([])
  const [requestError, setRequestError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [inspectorTab, setInspectorTab] =
    useState<InspectorTab>('changes')
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(
    () => new Set(['Project', 'Recruitment']),
  )
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const outline = useMemo(() => getSchemaOutline(source), [source])
  const filteredOutline = useMemo(() => {
    const query = schemaQuery.trim().toLowerCase()
    if (!query) return outline

    return outline.flatMap((entity) => {
      const entityMatches =
        entity.name.toLowerCase().includes(query) ||
        entity.tablename?.toLowerCase().includes(query)
      const matchingFields = entity.fields.filter(
        (field) =>
          field.name.toLowerCase().includes(query) ||
          field.type.toLowerCase().includes(query),
      )

      if (!entityMatches && matchingFields.length === 0) return []
      return [{ ...entity, fields: entityMatches ? entity.fields : matchingFields }]
    })
  }, [outline, schemaQuery])
  const selectedModel = models.find((model) => model.id === selectedModelId)
  const parsedModelId = Number(modelIdInput)
  const hasModelId =
    Number.isInteger(parsedModelId) && parsedModelId > 0 && modelIdInput !== ''

  const parseError = useMemo(() => {
    try {
      parseSchemaSource(source)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid schema source.'
    }
  }, [source])

  const totalFields = outline.reduce(
    (fieldCount, entity) => fieldCount + entity.fields.length,
    0,
  )
  const destructiveChangeCount = changes.filter((change) =>
    isDestructiveAction(change.action),
  ).length
  const validationProblemCount = problems.length + (parseError ? 1 : 0)
  const canSubmit =
    hasModelId && !parseError && problems.length === 0 && pendingAction === null

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(draftStorageKey(selectedModelId), source)
    } catch {
      // The editor remains usable when storage is disabled.
    }
    setIsDirty(false)
    setLastSaved(new Date())
  }, [selectedModelId, source])

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveDraft()
      }
    }

    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [saveDraft])

  const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme('burbot-night', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'string.key.json', foreground: '91A7FF' },
        { token: 'string.value.json', foreground: 'A7D7C5' },
        { token: 'number', foreground: 'F0B77E' },
        { token: 'keyword.json', foreground: 'D6A6F2' },
        { token: 'delimiter.bracket.json', foreground: '798196' },
      ],
      colors: {
        'editor.background': '#101217',
        'editor.foreground': '#D8DCE7',
        'editorLineNumber.foreground': '#4F5668',
        'editorLineNumber.activeForeground': '#AAB1C2',
        'editor.lineHighlightBackground': '#171A21',
        'editorCursor.foreground': '#8B7CFF',
        'editor.selectionBackground': '#39336A88',
        'editor.inactiveSelectionBackground': '#2B2F3A88',
        'editorIndentGuide.background1': '#252A35',
        'editorIndentGuide.activeBackground1': '#454C5D',
        'editorBracketMatch.background': '#8B7CFF22',
        'editorBracketMatch.border': '#8B7CFF77',
      },
    })

    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      enableSchemaRequest: false,
      schemas: [
        {
          uri: 'https://burbot.local/schema-definition.json',
          fileMatch: ['*'],
          schema: BURBOT_EDITOR_SCHEMA,
        },
      ],
    })
  }

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  const handleValidate: OnValidate = (markers) => {
    setProblems(
      markers.map((marker) => ({
        message: marker.message,
        line: marker.startLineNumber,
        column: marker.startColumn,
        severity: marker.severity,
      })),
    )
  }

  const updateSource = (value: string) => {
    setSource(value)
    setIsDirty(true)
    setHasPreviewed(false)
    setRegistration(null)
    setRequestError(null)
  }

  const revealInEditor = (name: string, parentName?: string) => {
    const lines = source.split('\n')
    const parentLine = parentName
      ? lines.findIndex((sourceLine) =>
          sourceLine.includes(JSON.stringify(parentName)),
        )
      : 0
    const line = lines.findIndex(
      (sourceLine, index) =>
        index >= Math.max(parentLine, 0) &&
        sourceLine.includes(JSON.stringify(name)),
    )
    if (line === -1) return

    editorRef.current?.revealLineInCenter(line + 1)
    editorRef.current?.setPosition({ lineNumber: line + 1, column: 1 })
    editorRef.current?.focus()
  }

  const toggleEntity = (entityName: string) => {
    setExpandedEntities((current) => {
      const next = new Set(current)
      if (next.has(entityName)) next.delete(entityName)
      else next.add(entityName)
      return next
    })
  }

  const handleAddEntity = () => {
    try {
      updateSource(addEntityToSource(source))
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : 'Could not add an entity.',
      )
    }
  }

  const handleFormat = () => {
    try {
      updateSource(formatSchemaSource(source))
      editorRef.current?.getAction('editor.action.formatDocument')?.run()
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : 'Could not format invalid JSON.',
      )
      setInspectorTab('problems')
    }
  }

  const handleReset = () => {
    if (
      isDirty &&
      !window.confirm('Replace the current draft with the example schema?')
    ) {
      return
    }
    updateSource(DEFAULT_SCHEMA_SOURCE)
  }

  const handleModelInput = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '')
    setModelIdInput(digitsOnly)
  }

  const commitModelId = () => {
    const nextModelId = modelIdInput ? Number(modelIdInput) : null
    if (nextModelId === selectedModelId) return

    try {
      localStorage.setItem(draftStorageKey(selectedModelId), source)
    } catch {
      // Switching models still works when storage is disabled.
    }

    onModelIdChange(nextModelId)
    setSource(readDraft(nextModelId))
    setIsDirty(false)
    setChanges([])
    setHasPreviewed(false)
    setRegistration(null)
    setRequestError(null)
  }

  const handlePreview = useCallback(async () => {
    if (!canSubmit) {
      setInspectorTab('problems')
      return
    }

    setPendingAction('preview')
    setRequestError(null)
    setRegistration(null)
    setInspectorTab('changes')

    try {
      const schema = parseSchemaSource(source)
      const response =
        await diffBusinessSchemaApiV1BusinessModelsModelIdSchemaDiffPost(
          parsedModelId,
          { schema },
        )

      if (response.status !== 200) {
        setRequestError(
          formatApiError(
            response.data,
            `The API returned status ${response.status}.`,
          ),
        )
        return
      }

      setChanges(response.data)
      setHasPreviewed(true)
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? `Could not preview this revision. ${error.message}`
          : 'Could not preview this revision.',
      )
    } finally {
      setPendingAction(null)
    }
  }, [canSubmit, parsedModelId, source])

  const handleRegister = async () => {
    if (!canSubmit) {
      setInspectorTab('problems')
      return
    }

    if (
      destructiveChangeCount > 0 &&
      !window.confirm(
        `This revision contains ${destructiveChangeCount} destructive change${destructiveChangeCount === 1 ? '' : 's'}. Register it?`,
      )
    ) {
      return
    }

    setPendingAction('register')
    setRequestError(null)
    setInspectorTab('changes')

    try {
      const schema = parseSchemaSource(source)
      const response =
        await registerBusinessSchemaApiV1BusinessModelsModelIdSchemaPut(
          parsedModelId,
          {
            schema,
            reason: reason.trim() || null,
            metadata_json: { created_from: 'burbot-studio' },
          },
        )

      if (response.status !== 200) {
        setRequestError(
          formatApiError(
            response.data,
            `The API returned status ${response.status}.`,
          ),
        )
        return
      }

      setRegistration(response.data)
      setChanges(response.data.changes)
      setHasPreviewed(true)
      saveDraft()
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? `Could not create this revision. ${error.message}`
          : 'Could not create this revision.',
      )
    } finally {
      setPendingAction(null)
    }
  }

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === 'Enter' &&
        canSubmit
      ) {
        event.preventDefault()
        void handlePreview()
      }
    }

    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [canSubmit, handlePreview])

  return (
    <div className="revision-workspace">
      <div className="revision-commandbar">
        <div className="breadcrumbs revision-breadcrumbs">
          <GitBranch size={14} />
          <span>{selectedModel?.name ?? 'Business model'}</span>
          <ChevronRight size={13} />
          <strong>New revision</strong>
          <span className="draft-pill">
            <Circle size={7} fill="currentColor" /> DRAFT
          </span>
        </div>

        <div className="revision-actions">
          <label className={`model-id-control ${!hasModelId ? 'is-missing' : ''}`}>
            <Hash size={13} />
            <span>MODEL</span>
            <input
              value={modelIdInput}
              onChange={(event) => handleModelInput(event.target.value)}
              onBlur={commitModelId}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              placeholder="ID"
              inputMode="numeric"
              aria-label="Business model ID"
            />
          </label>
          <button className="secondary-button" type="button" onClick={saveDraft}>
            <Save size={15} />
            Save draft
          </button>
          <button
            className="secondary-button preview-button"
            type="button"
            onClick={() => void handlePreview()}
            disabled={!canSubmit}
          >
            {pendingAction === 'preview' ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <WandSparkles size={15} />
            )}
            Preview
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void handleRegister()}
            disabled={!canSubmit}
          >
            {pendingAction === 'register' ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <GitCommitHorizontal size={16} />
            )}
            Create revision
          </button>
        </div>
      </div>

      <div className="studio-grid">
        <aside className="schema-explorer explorer-pane" aria-label="Schema explorer">
          <div className="pane-title-row">
            <span>EXPLORER</span>
            <div>
              <button
                className="icon-button"
                type="button"
                onClick={handleAddEntity}
                aria-label="Add entity"
                title="Add entity"
              >
                <Plus size={15} />
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={handleReset}
                aria-label="Reset example"
                title="Reset example"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <label className="explorer-search schema-search">
            <Search size={14} />
            <input
              value={schemaQuery}
              onChange={(event) => setSchemaQuery(event.target.value)}
              placeholder="Find entity or field"
              aria-label="Find schema item"
            />
          </label>

          <div className="schema-file-row is-active">
            <ChevronDown size={13} />
            <FileJson size={15} />
            <span>burbot-schema.json</span>
            {isDirty ? <span className="dirty-dot" title="Unsaved changes" /> : null}
          </div>

          <div className="outline-heading">
            <span>OUTLINE</span>
            <span>{outline.length}</span>
          </div>

          <div className="schema-outline">
            {filteredOutline.map((entity) => {
              const isExpanded = expandedEntities.has(entity.name)
              return (
                <div className="outline-entity" key={entity.name}>
                  <div className="outline-row entity-row">
                    <button
                      className="outline-chevron"
                      type="button"
                      onClick={() => toggleEntity(entity.name)}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${entity.name}`}
                    >
                      {isExpanded ? (
                        <ChevronDown size={13} />
                      ) : (
                        <ChevronRight size={13} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="outline-target"
                      onClick={() => revealInEditor(entity.name)}
                    >
                      <Table2 size={14} />
                      <span>{entity.name}</span>
                    </button>
                    <span className="outline-count">{entity.fields.length}</span>
                  </div>
                  {isExpanded ? (
                    <div className="outline-fields">
                      {entity.fields.map((field) => (
                        <button
                          type="button"
                          className="outline-field"
                          key={`${entity.name}.${field.name}`}
                          onClick={() => revealInEditor(field.name, entity.name)}
                        >
                          {field.type === 'Reference' ? (
                            <KeyRound size={13} />
                          ) : (
                            <Braces size={13} />
                          )}
                          <span>{field.name}</span>
                          <small>{field.type}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}

            {filteredOutline.length === 0 ? (
              <div className="outline-empty">
                <Code2 size={18} />
                <span>
                  {outline.length === 0
                    ? 'Fix the JSON to restore the outline.'
                    : 'No schema items match this search.'}
                </span>
              </div>
            ) : null}
          </div>

          <div className="history-block">
            <div className="outline-heading">
              <span>REVISION</span>
              <History size={13} />
            </div>
            <div className="history-item is-current">
              <CircleDot size={13} />
              <div>
                <strong>Working draft</strong>
                <span>{isDirty ? 'Local changes' : 'Saved locally'}</span>
              </div>
            </div>
            {registration?.revision_id ? (
              <div className="history-item">
                <CheckCircle2 size={13} />
                <div>
                  <strong>Revision #{registration.revision_id}</strong>
                  <span>Registered just now</span>
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="editor-pane" aria-label="Schema editor">
          <div className="editor-tabs">
            <div className="editor-tab is-active">
              <FileJson size={14} />
              <span>burbot-schema.json</span>
              {isDirty ? <span className="tab-dirty">●</span> : <span className="tab-close">×</span>}
            </div>
            <div className="editor-tools">
              <button type="button" onClick={handleFormat}>
                <Braces size={14} />
                Format
              </button>
              <span className="shortcut">⇧⌥F</span>
            </div>
          </div>

          <div className="editor-context-bar">
            <span>schema</span>
            <ChevronRight size={12} />
            <span>entities</span>
            <ChevronRight size={12} />
            <strong>{outline[0]?.name ?? '—'}</strong>
            <span className="context-spacer" />
            <span>{outline.length} entities</span>
            <span>·</span>
            <span>{totalFields} fields</span>
          </div>

          <div className="monaco-host">
            <Editor
              path="burbot-schema.json"
              language="json"
              theme="burbot-night"
              value={source}
              beforeMount={handleBeforeMount}
              onMount={handleMount}
              onValidate={handleValidate}
              onChange={(value) => updateSource(value ?? '')}
              loading={
                <div className="editor-loading">
                  <Loader2 className="spin" size={18} />
                  Loading schema intelligence…
                </div>
              }
              options={{
                automaticLayout: true,
                bracketPairColorization: { enabled: true },
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                fontFamily:
                  "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
                fontLigatures: true,
                fontSize: 13,
                folding: true,
                guides: { bracketPairs: true, indentation: true },
                lineHeight: 21,
                minimap: { enabled: false },
                padding: { top: 14, bottom: 14 },
                renderLineHighlight: 'all',
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                tabSize: 2,
                wordWrap: 'off',
              }}
            />
          </div>

          <div className="editor-statusbar">
            <div>
              {validationProblemCount === 0 ? (
                <span className="status-ok">
                  <CheckCircle2 size={13} /> Schema valid
                </span>
              ) : (
                <button type="button" onClick={() => setInspectorTab('problems')}>
                  <XCircle size={13} /> {validationProblemCount}{' '}
                  {validationProblemCount === 1 ? 'problem' : 'problems'}
                </button>
              )}
              <span>JSON</span>
              <span>UTF-8</span>
            </div>
            <div>
              <span>{isDirty ? 'Unsaved' : 'Draft saved'}</span>
              {lastSaved ? (
                <span className="saved-time">
                  <Clock3 size={12} />
                  {lastSaved.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="inspector-pane" aria-label="Revision inspector">
          <div className="inspector-tabs">
            <button
              type="button"
              className={inspectorTab === 'changes' ? 'is-active' : ''}
              onClick={() => setInspectorTab('changes')}
            >
              CHANGES
              {hasPreviewed ? <span>{changes.length}</span> : null}
            </button>
            <button
              type="button"
              className={inspectorTab === 'problems' ? 'is-active' : ''}
              onClick={() => setInspectorTab('problems')}
            >
              PROBLEMS
              {validationProblemCount > 0 ? (
                <span className="problem-badge">{validationProblemCount}</span>
              ) : null}
            </button>
          </div>

          <div className="inspector-content">
            {inspectorTab === 'changes' ? (
              <>
                <div className="revision-summary">
                  <div className="summary-icon">
                    <Layers3 size={18} />
                  </div>
                  <div>
                    <span>REVISION PREVIEW</span>
                    <strong>
                      {hasPreviewed
                        ? changes.length === 0
                          ? 'Schema is up to date'
                          : `${changes.length} proposed change${changes.length === 1 ? '' : 's'}`
                        : 'Not previewed yet'}
                    </strong>
                  </div>
                </div>

                {registration ? (
                  <div className="registration-result success-result">
                    <CheckCircle2 size={16} />
                    <div>
                      <strong>
                        {registration.changed
                          ? `Revision #${registration.revision_id ?? '—'} created`
                          : 'No revision needed'}
                      </strong>
                      <p>{registration.message}</p>
                    </div>
                  </div>
                ) : null}

                {requestError ? (
                  <div className="registration-result error-result" role="alert">
                    <AlertTriangle size={16} />
                    <div>
                      <strong>Request failed</strong>
                      <p>{requestError}</p>
                    </div>
                  </div>
                ) : null}

                {hasPreviewed && changes.length > 0 ? (
                  <div className="change-list">
                    {changes.map((change, index) => {
                      const kind = changeKind(change.action)
                      return (
                        <div
                          className={`change-item change-${kind}`}
                          key={`${change.action}-${change.entity}-${change.field ?? index}`}
                        >
                          <span className="change-glyph">
                            {actionGlyph(change.action)}
                          </span>
                          <div>
                            <div className="change-title">
                              <strong>{change.entity}</strong>
                              {change.field ? (
                                <>
                                  <span>.</span>
                                  <strong>{change.field}</strong>
                                </>
                              ) : null}
                            </div>
                            <span>
                              {change.action} {change.resource}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                {!hasPreviewed && !requestError ? (
                  <div className="inspector-empty">
                    <GitBranch size={24} />
                    <strong>See the migration plan</strong>
                    <p>
                      Preview compares this draft with the active schema without
                      registering it.
                    </p>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void handlePreview()}
                      disabled={!canSubmit}
                    >
                      <WandSparkles size={14} /> Preview changes
                    </button>
                  </div>
                ) : null}

                <div className="revision-message">
                  <label htmlFor="revision-reason">
                    REVISION MESSAGE <span>OPTIONAL</span>
                  </label>
                  <textarea
                    id="revision-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why is this schema changing?"
                    rows={3}
                  />
                </div>

                <div className="revision-safety">
                  <ShieldCheck size={15} />
                  <p>
                    Preview first. Burbot registers schema changes as one atomic
                    revision and keeps physical migration decisions explicit.
                  </p>
                </div>
              </>
            ) : (
              <div className="problems-panel">
                {parseError ? (
                  <button
                    type="button"
                    className="problem-row"
                    onClick={() => editorRef.current?.focus()}
                  >
                    <XCircle size={14} />
                    <div>
                      <strong>{parseError}</strong>
                      <span>Schema parser</span>
                    </div>
                  </button>
                ) : null}

                {problems.map((problem, index) => (
                  <button
                    type="button"
                    className="problem-row"
                    key={`${problem.line}-${problem.column}-${index}`}
                    onClick={() => {
                      editorRef.current?.revealLineInCenter(problem.line)
                      editorRef.current?.setPosition({
                        lineNumber: problem.line,
                        column: problem.column,
                      })
                      editorRef.current?.focus()
                    }}
                  >
                    <AlertTriangle size={14} />
                    <div>
                      <strong>{problem.message}</strong>
                      <span>
                        Ln {problem.line}, Col {problem.column}
                      </span>
                    </div>
                  </button>
                ))}

                {validationProblemCount === 0 ? (
                  <div className="inspector-empty problems-empty">
                    <Check size={24} />
                    <strong>No problems detected</strong>
                    <p>The draft matches the Burbot schema contract.</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
