import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import {
  Boxes,
  CircleHelp,
  Cloud,
  Database,
  GitBranch,
  Settings,
  TerminalSquare,
} from 'lucide-react'
import type { BusinessModel } from './api/models'
import { business } from './api/business'
import { ModelsView } from './views/ModelsView'
import './App.css'

const RevisionStudio = lazy(() =>
  import('./views/RevisionStudio').then((module) => ({
    default: module.RevisionStudio,
  })),
)
const DataView = lazy(() =>
  import('./views/DataView').then((module) => ({ default: module.DataView })),
)

type WorkspaceView = 'models' | 'revisions' | 'objects'

function viewFromLocation(): WorkspaceView {
  if (window.location.hash === '#/objects') return 'objects'
  return window.location.hash === '#/revisions' ? 'revisions' : 'models'
}

function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>(viewFromLocation)
  const [models, setModels] = useState<BusinessModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [modelsRefresh, setModelsRefresh] = useState(0)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const refreshModels = useCallback(() => {
    setModelsLoading(true)
    setModelsError(null)
    setModelsRefresh((value) => value + 1)
  }, [])

  useEffect(() => {
    const handleHashChange = () => setActiveView(viewFromLocation())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    business
      .models(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setModels(items)
        setSelectedModelId((id) =>
          items.some((model) => model.id === id) ? id : (items[0]?.id ?? null),
        )
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setModelsError(
            error instanceof Error
              ? error.message
              : 'Could not load business models.',
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelsLoading(false)
      })
    return () => controller.abort()
  }, [modelsRefresh])

  const navigate = (view: WorkspaceView) => {
    const hash = `#/${view}`
    if (window.location.hash !== hash) window.location.hash = hash
    setActiveView(view)
  }

  const handleModelCreated = (model: BusinessModel) => {
    setModels((current) => [
      model,
      ...current.filter(
        (candidate) => candidate.id !== model.id && candidate.key !== model.key,
      ),
    ])
    setSelectedModelId(model.id ?? null)
    navigate('revisions')
    refreshModels()
  }

  const handleOpenRevision = (model: BusinessModel) => {
    setSelectedModelId(model.id ?? null)
    navigate('revisions')
  }
  const handleModelUpdated = (model: BusinessModel) =>
    setModels((items) =>
      items.map((item) => (item.id === model.id ? model : item)),
    )
  const handleModelDeleted = (id: number) => {
    setModels((items) => items.filter((model) => model.id !== id))
    if (selectedModelId === id) setSelectedModelId(null)
    refreshModels()
  }

  return (
    <div className="app-shell">
      <header className="app-titlebar">
        <button
          type="button"
          className="brand"
          onClick={() => navigate('models')}
          aria-label="Burbot Studio home"
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">burbot</span>
          <span className="brand-product">STUDIO</span>
        </button>

        <div className="titlebar-center">
          <TerminalSquare size={13} />
          <span>
            {activeView === 'models'
              ? 'Business models'
              : activeView === 'objects'
                ? 'Business objects'
                : 'Program workspace'}
          </span>
          <span className="title-separator">—</span>
          <span className="title-project">Burbot</span>
        </div>

        <div className="titlebar-right">
          <span className="environment-pill">
            <span className="online-dot" />
            DEVELOPMENT
          </span>
          <span className="api-pill">
            <Cloud size={13} /> API
          </span>
          <div className="avatar" aria-label="Workspace user">
            BV
          </div>
        </div>
      </header>

      <div className="app-workspace">
        <nav className="activity-bar" aria-label="Workspace navigation">
          <div className="activity-main">
            <button
              type="button"
              className={activeView === 'models' ? 'is-active' : ''}
              onClick={() => navigate('models')}
              aria-label="Business models"
              data-tooltip="Business models"
            >
              <Boxes size={21} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              className={activeView === 'revisions' ? 'is-active' : ''}
              onClick={() => navigate('revisions')}
              aria-label="Revisions"
              data-tooltip="Revisions"
            >
              <GitBranch size={21} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              className={activeView === 'objects' ? 'is-active' : ''}
              onClick={() => navigate('objects')}
              aria-label="Business objects"
              data-tooltip="Business objects"
            >
              <Database size={21} strokeWidth={1.7} />
            </button>
          </div>

          <div className="activity-secondary">
            <button
              type="button"
              aria-label="Help"
              data-tooltip="Help"
              disabled
            >
              <CircleHelp size={19} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              aria-label="Settings"
              data-tooltip="Settings"
              disabled
            >
              <Settings size={19} strokeWidth={1.7} />
            </button>
          </div>
        </nav>

        <div className="view-host">
          {activeView === 'models' ? (
            <ModelsView
              models={models}
              selectedModelId={selectedModelId}
              onModelCreated={handleModelCreated}
              onOpenRevision={handleOpenRevision}
              onModelUpdated={handleModelUpdated}
              onModelDeleted={handleModelDeleted}
              loading={modelsLoading}
              error={modelsError}
              onRefresh={refreshModels}
            />
          ) : (
            <Suspense
              fallback={
                <div className="workspace-loading">
                  <span className="brand-mark" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  Loading revision workspace…
                </div>
              }
            >
              {activeView === 'objects' ? (
                <DataView
                  key={selectedModelId ?? 'unbound'}
                  models={models}
                  selectedModelId={selectedModelId}
                  onModelIdChange={setSelectedModelId}
                />
              ) : (
                <RevisionStudio
                  key={selectedModelId ?? 'unbound'}
                  models={models}
                  selectedModelId={selectedModelId}
                  onModelIdChange={setSelectedModelId}
                  onApplied={refreshModels}
                />
              )}
            </Suspense>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
