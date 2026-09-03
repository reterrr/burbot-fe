import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Boxes,
  CircleHelp,
  Cloud,
  GitBranch,
  Settings,
  TerminalSquare,
} from 'lucide-react'
import type { BusinessModel } from './api/models'
import { ModelsView } from './views/ModelsView'
import './App.css'

const RevisionStudio = lazy(() =>
  import('./views/RevisionStudio').then((module) => ({
    default: module.RevisionStudio,
  })),
)

type WorkspaceView = 'models' | 'revisions'

const MODEL_STORAGE_KEY = 'burbot:recent-models'

function viewFromLocation(): WorkspaceView {
  return window.location.hash === '#/revisions' ? 'revisions' : 'models'
}

function readModels(): BusinessModel[] {
  try {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? (parsed as BusinessModel[]) : []
  } catch {
    return []
  }
}

function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>(viewFromLocation)
  const [models, setModels] = useState<BusinessModel[]>(readModels)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(() => {
    const firstModel = readModels().find((model) => model.id != null)
    return firstModel?.id ?? null
  })

  useEffect(() => {
    const handleHashChange = () => setActiveView(viewFromLocation())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(models))
    } catch {
      // Recent models are an enhancement; the API workflow still works without it.
    }
  }, [models])

  const navigate = (view: WorkspaceView) => {
    const hash = view === 'revisions' ? '#/revisions' : '#/models'
    if (window.location.hash !== hash) window.location.hash = hash
    setActiveView(view)
  }

  const handleModelCreated = (model: BusinessModel) => {
    setModels((current) => [
      model,
      ...current.filter(
        (candidate) =>
          candidate.id !== model.id && candidate.key !== model.key,
      ),
    ])
    setSelectedModelId(model.id ?? null)
    navigate('revisions')
  }

  const handleOpenRevision = (model: BusinessModel) => {
    setSelectedModelId(model.id ?? null)
    navigate('revisions')
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
              : 'Revision workspace'}
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
              <RevisionStudio
                models={models}
                selectedModelId={selectedModelId}
                onModelIdChange={setSelectedModelId}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
