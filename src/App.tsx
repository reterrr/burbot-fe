import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import {
  Boxes,
  CircleHelp,
  Cloud,
  Database,
  GitBranch,
  History,
  Inbox,
  Settings,
  TerminalSquare,
} from 'lucide-react'
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router'
import type { BusinessModel } from './api/models'
import { business } from './api/business'
import { localTasksEnabled } from './app/studio'
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
const TaskRoutes = lazy(() => import('./features/tasks/TaskRoutes'))
const TaskCount = lazy(() => import('./features/tasks/components/TaskCount'))
const activeClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'is-active' : ''

function App() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const sectionTitle =
    pathname === '/tasks/history'
      ? 'Workflow history'
      : pathname.startsWith('/tasks')
        ? 'Task management'
        : pathname === '/objects'
          ? 'Business objects'
          : pathname === '/revisions'
            ? 'Program workspace'
            : 'Business models'
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

  const handleModelCreated = (model: BusinessModel) => {
    setModels((current) => [
      model,
      ...current.filter(
        (candidate) => candidate.id !== model.id && candidate.key !== model.key,
      ),
    ])
    setSelectedModelId(model.id ?? null)
    navigate('/revisions')
    refreshModels()
  }

  const handleOpenRevision = (model: BusinessModel) => {
    setSelectedModelId(model.id ?? null)
    navigate('/revisions')
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
          onClick={() => navigate('/models')}
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
          <span>{sectionTitle}</span>
          <span className="title-separator">—</span>
          <span className="title-project">Burbot</span>
        </div>

        <div className="titlebar-right">
          <span className="environment-pill">
            <span className="online-dot" />
            {import.meta.env.DEV ? 'DEVELOPMENT' : 'PRODUCTION'}
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
            <NavLink
              to="/models"
              className={activeClass}
              aria-label="Business models"
              data-tooltip="Business models"
            >
              <Boxes size={21} strokeWidth={1.7} />
            </NavLink>
            <NavLink
              to="/revisions"
              className={activeClass}
              aria-label="Revisions"
              data-tooltip="Revisions"
            >
              <GitBranch size={21} strokeWidth={1.7} />
            </NavLink>
            <NavLink
              to="/objects"
              className={activeClass}
              aria-label="Business objects"
              data-tooltip="Business objects"
            >
              <Database size={21} strokeWidth={1.7} />
            </NavLink>
            {localTasksEnabled && (
              <div className="activity-tasks">
                <NavLink
                  to="/tasks"
                  end
                  className={
                    pathname.startsWith('/tasks') &&
                    pathname !== '/tasks/history'
                      ? 'is-active'
                      : ''
                  }
                  aria-label="Task inbox"
                  data-tooltip="Task inbox"
                >
                  <Inbox size={21} strokeWidth={1.7} />
                  <Suspense fallback={null}>
                    <TaskCount />
                  </Suspense>
                </NavLink>
                <NavLink
                  to="/tasks/history"
                  className={activeClass}
                  aria-label="Workflow history"
                  data-tooltip="Workflow history"
                >
                  <History size={20} strokeWidth={1.7} />
                </NavLink>
              </div>
            )}
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
          <Suspense
            fallback={
              <div className="workspace-loading" role="status">
                Loading workspace…
              </div>
            }
          >
            <Routes>
              <Route
                path="/models"
                element={
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
                }
              />
              <Route
                path="/objects"
                element={
                  <DataView
                    key={selectedModelId ?? 'unbound'}
                    models={models}
                    selectedModelId={selectedModelId}
                    onModelIdChange={setSelectedModelId}
                  />
                }
              />
              <Route
                path="/revisions"
                element={
                  <RevisionStudio
                    key={selectedModelId ?? 'unbound'}
                    models={models}
                    selectedModelId={selectedModelId}
                    onModelIdChange={setSelectedModelId}
                    onApplied={refreshModels}
                  />
                }
              />
              <Route
                path="/tasks/*"
                element={
                  localTasksEnabled ? (
                    <TaskRoutes />
                  ) : (
                    <p className="workspace-loading">
                      Task management is available in local development.
                    </p>
                  )
                }
              />
              <Route path="*" element={<Navigate to="/models" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default App
