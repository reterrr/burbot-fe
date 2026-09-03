import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Box,
  Boxes,
  Braces,
  Check,
  ChevronRight,
  Database,
  FileJson,
  Loader2,
  Plus,
  Search,
  Server,
  Sparkles,
} from 'lucide-react'
import type { BusinessModel } from '../api/models'
import { createBusinessModelApiV1BusinessModelsPost } from '../api/generated/business/business'
import { formatApiError } from '../lib/api-error'

interface ModelsViewProps {
  models: BusinessModel[]
  selectedModelId: number | null
  onModelCreated: (model: BusinessModel) => void
  onOpenRevision: (model: BusinessModel) => void
}

function toModelKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function ModelsView({
  models,
  selectedModelId,
  onModelCreated,
  onOpenRevision,
}: ModelsViewProps) {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)
  const [query, setQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return models

    return models.filter(
      (model) =>
        model.name.toLowerCase().includes(normalizedQuery) ||
        model.key.toLowerCase().includes(normalizedQuery),
    )
  }, [models, query])

  const handleNameChange = (value: string) => {
    setName(value)
    if (!keyEdited) setKey(toModelKey(value))
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || !key.trim()) return

    setIsCreating(true)
    setError(null)

    try {
      const response = await createBusinessModelApiV1BusinessModelsPost({
        name: name.trim(),
        key: key.trim(),
        description: description.trim() || null,
        metadata_json: { created_from: 'burbot-studio' },
      })

      if (response.status !== 201) {
        setError(
          formatApiError(
            response.data,
            `The API returned status ${response.status}.`,
          ),
        )
        return
      }

      onModelCreated(response.data)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? `Could not reach the Burbot API. ${requestError.message}`
          : 'Could not reach the Burbot API.',
      )
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="models-layout">
      <aside className="explorer-pane models-explorer" aria-label="Business models">
        <div className="pane-title-row">
          <span>BUSINESS MODELS</span>
          <button
            className="icon-button"
            type="button"
            aria-label="New model"
            onClick={() => document.getElementById('model-name')?.focus()}
          >
            <Plus size={15} />
          </button>
        </div>

        <label className="explorer-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter models"
            aria-label="Filter models"
          />
        </label>

        <div className="explorer-section-label">
          <ChevronRight size={13} />
          <span>WORKSPACE</span>
          <span className="section-count">{models.length}</span>
        </div>

        <div className="model-tree">
          {filteredModels.length > 0 ? (
            filteredModels.map((model) => (
              <button
                type="button"
                className={`tree-model ${selectedModelId === model.id ? 'is-selected' : ''}`}
                key={model.id ?? model.key}
                onClick={() => onOpenRevision(model)}
              >
                <Database size={15} />
                <span>
                  <strong>{model.name}</strong>
                  <small>{model.key}</small>
                </span>
              </button>
            ))
          ) : (
            <div className="tree-empty">
              <Box size={18} />
              <span>{models.length === 0 ? 'No models yet' : 'No matches'}</span>
            </div>
          )}
        </div>

        <div className="explorer-endpoint">
          <Server size={14} />
          <div>
            <span>API ENDPOINT</span>
            <code>/api/v1/business/models</code>
          </div>
          <span className="connection-dot" aria-label="API connection" />
        </div>
      </aside>

      <main className="models-canvas">
        <div className="canvas-toolbar">
          <div className="breadcrumbs">
            <Boxes size={14} />
            <span>Business models</span>
            <ChevronRight size={13} />
            <strong>New model</strong>
          </div>
          <div className="toolbar-hint">
            <span className="keycap">⌘</span>
            <span className="keycap">K</span>
            <span>Commands</span>
          </div>
        </div>

        <div className="model-create-scroll">
          <section className="model-create-stage">
            <div className="stage-heading">
              <div className="eyebrow">
                <Sparkles size={14} />
                NEW NAMESPACE
              </div>
              <h1>Create a business model</h1>
              <p>
                Start with a stable namespace. Entities, fields, relations, and
                every future schema revision will live inside it.
              </p>
            </div>

            <div className="create-grid">
              <form className="model-form" onSubmit={handleCreate}>
                <div className="form-section-heading">
                  <div className="step-number">01</div>
                  <div>
                    <h2>Model identity</h2>
                    <p>The key stays stable after the model is created.</p>
                  </div>
                </div>

                <label className="field-label" htmlFor="model-name">
                  Name
                  <input
                    id="model-name"
                    value={name}
                    onChange={(event) => handleNameChange(event.target.value)}
                    placeholder="Recruitment operations"
                    autoComplete="off"
                    required
                    autoFocus
                  />
                  <small>Human-readable name shown across the workspace.</small>
                </label>

                <label className="field-label" htmlFor="model-key">
                  Key
                  <div className="input-with-prefix">
                    <span>model://</span>
                    <input
                      id="model-key"
                      value={key}
                      onChange={(event) => {
                        setKeyEdited(true)
                        setKey(toModelKey(event.target.value))
                      }}
                      placeholder="recruitment_operations"
                      pattern="[a-z0-9_]+"
                      required
                    />
                  </div>
                  <small>Lowercase letters, numbers, and underscores only.</small>
                </label>

                <label className="field-label" htmlFor="model-description">
                  Description <span className="optional-label">OPTIONAL</span>
                  <textarea
                    id="model-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What business domain does this model describe?"
                    rows={4}
                  />
                </label>

                {error ? (
                  <div className="inline-alert error-alert" role="alert">
                    <span className="alert-mark">!</span>
                    <p>{error}</p>
                  </div>
                ) : null}

                <div className="form-actions">
                  <div className="submit-explainer">
                    <Check size={14} />
                    Opens a clean revision draft next
                  </div>
                  <button
                    className="primary-button create-button"
                    type="submit"
                    disabled={isCreating || !name.trim() || !key.trim()}
                  >
                    {isCreating ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                    Create model
                    {!isCreating ? <ArrowRight size={15} /> : null}
                  </button>
                </div>
              </form>

              <aside className="model-blueprint" aria-label="Model structure">
                <div className="blueprint-topline">
                  <span>STRUCTURE PREVIEW</span>
                  <Braces size={15} />
                </div>
                <div className="blueprint-node root-node">
                  <div className="node-icon violet">
                    <Database size={16} />
                  </div>
                  <div>
                    <strong>{name || 'BusinessModel'}</strong>
                    <span>{key || 'your_model_key'}</span>
                  </div>
                </div>
                <div className="blueprint-children">
                  <div className="blueprint-line" />
                  <div className="blueprint-node">
                    <div className="node-icon blue">
                      <Box size={15} />
                    </div>
                    <div>
                      <strong>Entities</strong>
                      <span>Types and fields</span>
                    </div>
                  </div>
                  <div className="blueprint-node">
                    <div className="node-icon green">
                      <FileJson size={15} />
                    </div>
                    <div>
                      <strong>Revisions</strong>
                      <span>Atomic schema changes</span>
                    </div>
                  </div>
                </div>

                <div className="blueprint-note">
                  <span className="note-index">B/01</span>
                  <p>
                    Business objects are data instances. They are created later
                    from the active entity definitions.
                  </p>
                </div>
              </aside>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
