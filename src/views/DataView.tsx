import { useEffect, useState, type FormEvent } from 'react'
import {
  Archive,
  Database,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Table2,
  X,
} from 'lucide-react'
import { business } from '../api/business'
import type {
  BusinessModel,
  BusinessObjectRead,
  EntityDefinitionRead,
} from '../api/models'
import {
  assignValues,
  createValues,
  editableFields,
  objectValues,
  parseNamedValues,
} from '../lib/objects'

const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : 'The request failed.'
const utc = (value: string) =>
  value ? new Date(`${value}Z`).toISOString() : undefined
type Inspection = {
  title: string
  load: (offset: number) => Promise<unknown[]>
  paginated?: boolean
}

function HistoryPanel({
  inspection,
  onClose,
  onInspect,
}: {
  inspection: Inspection
  onClose: () => void
  onInspect: (inspection: Inspection) => void
}) {
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<unknown[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const changePage = (offset: number) => {
    setRows(null)
    setError(null)
    setOffset(offset)
  }
  useEffect(() => {
    let active = true
    inspection
      .load(offset)
      .then((value) => {
        if (active) {
          setRows(value)
          setError(null)
        }
      })
      .catch((failure) => {
        if (active) {
          setError(message(failure))
          setRows(null)
        }
      })
    return () => {
      active = false
    }
  }, [inspection, offset])
  return (
    <section className="data-inspection">
      <div className="data-heading">
        <History size={16} />
        <h3>{inspection.title}</h3>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close history"
        >
          <X size={16} />
        </button>
      </div>
      {error && (
        <p role="alert" className="danger-text">
          {error}
        </p>
      )}
      {!rows && !error && <p role="status">Loading…</p>}
      {rows?.length === 0 && <p>No records.</p>}
      {rows?.map((row, index) => {
        const relationId =
          typeof row === 'object' && row !== null && 'relation_id' in row
            ? row.relation_id
            : null
        return (
          <div key={index}>
            <pre className="json-preview">{JSON.stringify(row, null, 2)}</pre>
            {typeof relationId === 'string' && (
              <button
                className="secondary-button"
                onClick={() =>
                  onInspect({
                    title: `Relation ${relationId}`,
                    load: (offset) =>
                      business.relationHistory(relationId, offset),
                    paginated: true,
                  })
                }
              >
                Relation history
              </button>
            )}
          </div>
        )
      })}
      {inspection.paginated && (
        <div className="pagination">
          <button
            disabled={!offset || !rows}
            onClick={() => changePage(Math.max(0, offset - 100))}
          >
            Previous
          </button>
          <span>
            {offset + 1}–{offset + (rows?.length ?? 0)}
          </span>
          <button
            disabled={!rows || rows.length < 100}
            onClick={() => changePage(offset + 100)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  )
}

function ObjectEditor({
  entity,
  object,
  readOnly,
  busy,
  onSubmit,
}: {
  entity: EntityDefinitionRead
  object: BusinessObjectRead | null
  readOnly: boolean
  busy: boolean
  onSubmit: (
    values: Record<string, unknown>,
    effectiveAt?: string,
  ) => Promise<void>
}) {
  const [text, setText] = useState(() =>
    JSON.stringify(object ? objectValues(entity, object) : {}, null, 2),
  )
  const [effectiveAt, setEffectiveAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      await onSubmit(parseNamedValues(text), utc(effectiveAt))
    } catch (failure) {
      setError(message(failure))
    }
  }
  return (
    <form className="object-editor" onSubmit={(event) => void submit(event)}>
      <h3>{object ? `Object #${object.id}` : 'New object'}</h3>
      <label className="field-label">
        Values by field name (JSON)
        <textarea
          aria-label="Object values"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={9}
          spellCheck={false}
          disabled={readOnly || busy}
        />
      </label>
      <p className="panel-note">
        Omit a field to keep its value or use its default on creation. Use null
        to clear a nullable value. Decimal values may be strings; references and
        Source values are integer IDs.
      </p>
      {object && (
        <label className="field-label">
          Effective from (UTC, optional)
          <input
            type="datetime-local"
            aria-label="Effective from"
            value={effectiveAt}
            onChange={(event) => setEffectiveAt(event.target.value)}
            disabled={readOnly || busy}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="danger-text">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={readOnly || busy}>
        {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}{' '}
        {object ? 'Save values' : 'Create object'}
      </button>
    </form>
  )
}

function EntityWorkspace({ entity }: { entity: EntityDefinitionRead }) {
  const [objects, setObjects] = useState<BusinessObjectRead[] | null>(null)
  const [selected, setSelected] = useState<BusinessObjectRead | null>(null)
  const [editing, setEditing] = useState(false)
  const [offset, setOffset] = useState(0)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [at, setAt] = useState('')
  const [knownAt, setKnownAt] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const historical = !!(at || knownAt)
  const writable = !historical && entity.status === 'ACTIVE'
  const reload = () => {
    setObjects(null)
    setError(null)
    setSelected(null)
    setEditing(false)
    setRefresh((value) => value + 1)
  }
  useEffect(() => {
    const controller = new AbortController()
    business
      .objects(
        entity.entity_id,
        offset,
        includeArchived,
        utc(at),
        utc(knownAt),
        controller.signal,
      )
      .then((value) => {
        if (!controller.signal.aborted) setObjects(value)
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(message(failure))
      })
    return () => controller.abort()
  }, [entity.entity_id, offset, includeArchived, at, knownAt, refresh])

  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      reload()
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }
  const open = (object: BusinessObjectRead) => {
    setSelected(object)
    setEditing(true)
    setError(null)
  }
  const save = async (
    values: Record<string, unknown>,
    effectiveAt?: string,
  ) => {
    setBusy(true)
    try {
      if (selected)
        await business.assignValues(selected.id, {
          ...assignValues(entity, selected, values),
          effective_at: effectiveAt,
        })
      else
        await business.createObject(
          entity.entity_id,
          createValues(entity, values),
        )
      reload()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="entity-workspace">
      <div className="data-heading">
        <Table2 size={18} />
        <h2>{entity.label}</h2>
        <span className="draft-pill">{entity.status}</span>
        <span className="context-spacer" />
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() =>
            setInspection({
              title: `${entity.key} definition history`,
              load: (offset) =>
                business.entityHistory(entity.entity_id, offset),
              paginated: true,
            })
          }
        >
          Definition history
        </button>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() =>
            setInspection({
              title: `${entity.key} relations`,
              load: () => business.relations(entity.entity_id),
            })
          }
        >
          Relations
        </button>
        <button
          className="secondary-button"
          onClick={reload}
          disabled={busy}
          aria-label="Refresh objects"
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="primary-button"
          disabled={!writable || busy}
          onClick={() => {
            setSelected(null)
            setEditing(true)
          }}
        >
          <Plus size={14} />
          New object
        </button>
      </div>
      <div className="data-filters">
        <label>
          <input
            type="checkbox"
            checked={includeArchived}
            disabled={busy}
            onChange={(event) => {
              setIncludeArchived(event.target.checked)
              setOffset(0)
              reload()
            }}
          />
          Include archived
        </label>
        <label>
          Valid at (UTC)
          <input
            type="datetime-local"
            value={at}
            disabled={busy}
            onChange={(event) => {
              setAt(event.target.value)
              setOffset(0)
              reload()
            }}
          />
        </label>
        <label>
          Known at (UTC)
          <input
            type="datetime-local"
            value={knownAt}
            disabled={busy}
            onChange={(event) => {
              setKnownAt(event.target.value)
              setOffset(0)
              reload()
            }}
          />
        </label>
        {historical && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              setAt('')
              setKnownAt('')
              setOffset(0)
              reload()
            }}
          >
            Return to current
          </button>
        )}
      </div>
      {historical && (
        <p className="panel-note">
          Historical values are read only. Field labels below use the current
          definitions.
        </p>
      )}
      {error && (
        <div className="inline-alert error-alert" role="alert">
          <p>{error}</p>
        </div>
      )}
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Object</th>
              {entity.fields.map((field) => (
                <th key={field.field_id}>
                  <button
                    onClick={() =>
                      setInspection({
                        title: `${entity.key}.${field.key} definition history`,
                        load: (offset) =>
                          business.fieldHistory(field.field_id, offset),
                        paginated: true,
                      })
                    }
                  >
                    {field.key}
                    <small>
                      {String(field.definition.type)} · {field.persistent_key}
                    </small>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {objects?.map((object) => (
              <tr
                key={object.id}
                className={selected?.id === object.id ? 'is-selected' : ''}
              >
                <td>
                  <button onClick={() => open(object)} disabled={busy}>
                    #{object.id}
                    {object.archived_at && <Archive size={12} />}
                  </button>
                </td>
                {entity.fields.map((field) => {
                  const slot = object.fields.find(
                    (item) => item.business_entity_field_id === field.field_id,
                  )
                  return (
                    <td key={field.field_id}>
                      <button
                        disabled={!slot || busy}
                        title="View value history"
                        onClick={() =>
                          slot &&
                          setInspection({
                            title: `Object #${object.id} · ${field.key} value history`,
                            load: (offset) =>
                              business.valueHistory(
                                slot.object_field_id,
                                offset,
                              ),
                            paginated: true,
                          })
                        }
                      >
                        {slot?.value_id != null
                          ? JSON.stringify(slot.value)
                          : '—'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!objects && !error && (
        <p role="status" className="panel-note">
          Loading objects…
        </p>
      )}
      {objects?.length === 0 && (
        <p className="panel-note">No objects in this view.</p>
      )}
      <div className="pagination">
        <button
          disabled={!offset || busy || !objects}
          onClick={() => {
            setOffset((value) => Math.max(0, value - 20))
            reload()
          }}
        >
          Previous
        </button>
        <span>
          {objects?.length ? `${offset + 1}–${offset + objects.length}` : '0'}{' '}
          objects
        </span>
        <button
          disabled={!objects || objects.length < 20 || busy}
          onClick={() => {
            setOffset((value) => value + 20)
            reload()
          }}
        >
          Next
        </button>
      </div>
      <div className="data-detail-grid">
        {editing && (
          <div>
            <ObjectEditor
              key={selected?.id ?? 'new'}
              entity={entity}
              object={selected}
              busy={busy}
              readOnly={!writable || !!selected?.archived_at}
              onSubmit={save}
            />
            {selected && (
              <div className="data-actions">
                <button
                  className="secondary-button"
                  disabled={!writable || busy || !!selected.archived_at}
                  onClick={() =>
                    void perform(() => business.syncFields(selected.id))
                  }
                >
                  Sync fields
                </button>
                <button
                  className="secondary-button"
                  disabled={historical || busy}
                  onClick={() =>
                    void perform(() =>
                      selected.archived_at
                        ? business.restore(selected.id)
                        : business.archive(selected.id),
                    )
                  }
                >
                  {selected.archived_at ? 'Restore object' : 'Archive object'}
                </button>
                <button
                  className="secondary-button danger-text"
                  disabled={historical || busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Delete this empty object? Objects with value history must be archived instead.',
                      )
                    )
                      void perform(() => business.deleteObject(selected.id))
                  }}
                >
                  Delete empty object
                </button>
              </div>
            )}
          </div>
        )}
        {inspection && (
          <HistoryPanel
            key={inspection.title}
            inspection={inspection}
            onClose={() => setInspection(null)}
            onInspect={setInspection}
          />
        )}
      </div>
      <details className="program-help">
        <summary>Active editable fields</summary>
        {editableFields(entity).map((field) => (
          <div key={field.field_id}>
            <strong>{field.key}</strong>
            <pre className="json-preview">
              {JSON.stringify(field.definition, null, 2)}
            </pre>
          </div>
        ))}
      </details>
    </div>
  )
}

export function DataView({
  models,
  selectedModelId,
  onModelIdChange,
}: {
  models: BusinessModel[]
  selectedModelId: number | null
  onModelIdChange: (id: number | null) => void
}) {
  const [entities, setEntities] = useState<EntityDefinitionRead[]>([])
  const [entityId, setEntityId] = useState<number | null>(null)
  const [loading, setLoading] = useState(selectedModelId !== null)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (selectedModelId === null) return
    const controller = new AbortController()
    const load = async () => {
      const all: EntityDefinitionRead[] = []
      let page: EntityDefinitionRead[]
      do {
        page = await business.entities(
          selectedModelId,
          all.length,
          controller.signal,
        )
        all.push(...page)
      } while (page.length === 100)
      if (!controller.signal.aborted) {
        setEntities(all)
        setEntityId((id) =>
          all.some((item) => item.entity_id === id)
            ? id
            : (all[0]?.entity_id ?? null),
        )
      }
    }
    load()
      .catch((failure) => {
        if (!controller.signal.aborted) setError(message(failure))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [selectedModelId, refresh])
  const entity = entities.find((item) => item.entity_id === entityId)
  return (
    <div className="data-workspace">
      <aside className="explorer-pane data-explorer">
        <div className="pane-title-row">
          <span>BUSINESS DATA</span>
          <button
            className="icon-button"
            onClick={() => {
              setLoading(selectedModelId !== null)
              setError(null)
              setRefresh((value) => value + 1)
            }}
            aria-label="Refresh entities"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <select
          className="workspace-select"
          aria-label="Data business model"
          value={selectedModelId ?? ''}
          onChange={(event) =>
            onModelIdChange(
              event.target.value ? Number(event.target.value) : null,
            )
          }
        >
          <option value="">Select a model</option>
          {models.map((model) => (
            <option key={model.id} value={model.id!}>
              {model.name}
            </option>
          ))}
        </select>
        {loading && (
          <p role="status" className="panel-note">
            Loading entities…
          </p>
        )}
        {error && (
          <p role="alert" className="panel-note danger-text">
            {error}
          </p>
        )}
        {entities.map((item) => (
          <button
            className={`tree-model ${item.entity_id === entityId ? 'is-selected' : ''}`}
            key={item.entity_id}
            onClick={() => setEntityId(item.entity_id)}
          >
            <Table2 size={14} />
            <span>
              <strong>{item.label}</strong>
              <small>
                {item.status} · #{item.entity_id}
              </small>
            </span>
          </button>
        ))}
      </aside>
      <main className="data-canvas">
        {entity && !loading ? (
          <EntityWorkspace
            key={`${entity.entity_id}:${entity.version_id}`}
            entity={entity}
          />
        ) : (
          <div className="workspace-loading">
            <Database size={20} />
            {selectedModelId === null
              ? 'Select a business model.'
              : loading
                ? 'Loading definitions…'
                : 'Register a schema to start working with objects.'}
          </div>
        )}
      </main>
    </div>
  )
}
