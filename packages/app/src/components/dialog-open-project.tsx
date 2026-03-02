import { createMemo, createSignal, For, Show, onMount } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useNavigate } from "@solidjs/router"
import { useLayout } from "@/context/layout"
import { base64Encode } from "@opencode-ai/util/encode"
import { useServer } from "@/context/server"
import { showToast } from "@opencode-ai/ui/toast"

// 剧本项目类型
interface ScriptProject {
  name: string
  path: string
  updatedAt: number
}

interface DialogOpenProjectProps {
  onSelect?: (projectPath: string) => void
  onClose?: () => void
}

// 获取项目列表
async function fetchProjects(sdk: ReturnType<typeof useGlobalSDK>): Promise<ScriptProject[]> {
  const response = await sdk.client.project.discover()
  return (response.data || [])
    .map((p) => ({
      name: p.name,
      path: p.path,
      updatedAt: p.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

// 创建新项目目录
async function createProject(
  sdk: ReturnType<typeof useGlobalSDK>,
  projectName: string,
): Promise<{ path: string; name: string; gitInitialized: boolean } | null> {
  const sanitizedName = projectName.replace(/[<>:"\\|?*]/g, "").trim()
  if (!sanitizedName) return null

  const response = await fetch(`${sdk.url}/file/mkdir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: sanitizedName }),
  })
  if (!response.ok) {
    const msg = await response.text().catch(() => response.statusText)
    throw new Error(msg)
  }
  const data = await response.json()
  return { path: data.path, name: sanitizedName, gitInitialized: data.gitInitialized as boolean }
}

export function DialogOpenProject(props: DialogOpenProjectProps) {
  const sdk = useGlobalSDK()
  const sync = useGlobalSync()
  const language = useLanguage()
  const dialog = useDialog()
  const navigate = useNavigate()
  const layout = useLayout()
  const server = useServer()

  // 工作区路径来自服务器报告的当前项目目录
  const workspacePath = createMemo(() => sync.data.path.directory)

  const [projects, setProjects] = createSignal<ScriptProject[]>([])
  const [loading, setLoading] = createSignal(false)
  const [showCreateForm, setShowCreateForm] = createSignal(false)
  const [newProjectName, setNewProjectName] = createSignal("")
  const [creating, setCreating] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const loadProjects = () => {
    setLoading(true)
    setError(null)
    fetchProjects(sdk)
      .then(setProjects)
      .catch(() => setError(language.t("dialog.scriptProject.loadError")))
      .finally(() => setLoading(false))
  }

  onMount(loadProjects)

  const openProject = (projectPath: string) => {
    layout.projects.open(projectPath)
    server.projects.touch(projectPath)
    navigate(`/${base64Encode(projectPath)}`)
    props.onSelect?.(projectPath)
    dialog.close()
  }

  const handleCreateProject = () => {
    const name = newProjectName().trim()
    if (!name) {
      setError(language.t("dialog.scriptProject.nameRequired"))
      return
    }
    if (projects().some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setError(language.t("dialog.scriptProject.nameExists"))
      return
    }

    setCreating(true)
    setError(null)

    createProject(sdk, name)
      .then((result) => {
        if (!result) {
          setError(language.t("dialog.scriptProject.createError"))
          return
        }
        if (result.gitInitialized) {
          setProjects((prev) => [{ name: result.name, path: result.path, updatedAt: Date.now() }, ...prev])
        }
        if (!result.gitInitialized) {
          showToast({ variant: "error", title: language.t("dialog.scriptProject.gitInitFailed") })
        }
        openProject(result.path)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setError(`${language.t("dialog.scriptProject.createError")}: ${msg}`)
      })
      .finally(() => setCreating(false))
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && showCreateForm()) {
      e.preventDefault()
      e.stopPropagation()
      setShowCreateForm(false)
      setNewProjectName("")
      setError(null)
    }
  }

  const cancelCreate = () => {
    setShowCreateForm(false)
    setNewProjectName("")
    setError(null)
  }

  return (
    <Dialog
      title={
        <div class="flex items-center gap-2">
          <Icon name="folder" size="small" />
          <span>{language.t("dialog.scriptProject.title")}</span>
        </div>
      }
      size="large"
      class="w-[600px] max-h-[80vh]"
    >
      <div class="flex flex-col h-full" onKeyDown={handleKeyDown}>
        <Show when={error()}>
          <div class="mb-4 p-3 bg-surface-critical-subtle text-text-critical rounded-md text-14-regular">{error()}</div>
        </Show>

        <Show when={showCreateForm()}>
          <div class="mb-6 p-4 bg-surface-base rounded-lg border border-border-weak-base">
            <div class="text-14-medium text-text-strong mb-3">{language.t("dialog.scriptProject.createTitle")}</div>
            <div class="flex gap-3">
              <input
                type="text"
                placeholder={language.t("dialog.scriptProject.namePlaceholder")}
                class="flex-1 px-3 py-2 bg-surface-base text-text-strong text-14-regular border border-border-weak-base rounded-md focus:outline-none focus:border-border-strong-base placeholder:text-text-weak"
                value={newProjectName()}
                onInput={(e) => setNewProjectName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleCreateProject()
                  }
                }}
                autofocus
              />
              <Button size="normal" onClick={handleCreateProject} disabled={creating()}>
                <Show when={!creating()} fallback={language.t("common.creating")}>
                  {language.t("dialog.scriptProject.create")}
                </Show>
              </Button>
              <Button size="normal" variant="ghost" onClick={cancelCreate} disabled={creating()}>
                {language.t("common.cancel")}
              </Button>
            </div>
          </div>
        </Show>

        <div class="flex-1 overflow-y-auto min-h-[200px] max-h-[400px]">
          <Show
            when={!loading()}
            fallback={
              <div class="flex items-center justify-center h-full py-8 text-text-weak text-14-regular">
                <Icon name="selector" size="normal" class="animate-spin mr-2" />
                {language.t("common.loading")}
              </div>
            }
          >
            <Show
              when={projects().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center h-full py-8 text-center">
                  <Icon name="folder" size="large" class="text-text-weak mb-3" />
                  <div class="text-14-medium text-text-weak">{language.t("dialog.scriptProject.empty")}</div>
                  <div class="text-12-regular text-text-weak mt-1">{language.t("dialog.scriptProject.emptyHint")}</div>
                </div>
              }
            >
              <ul class="flex flex-col gap-1">
                <For each={projects()}>
                  {(project) => (
                    <li>
                      <button
                        class="w-full flex items-center gap-3 px-3 py-3 rounded-md hover:bg-surface-raised-base transition-colors text-left group"
                        onClick={() => openProject(project.path)}
                      >
                        <Icon
                          name="folder"
                          size="normal"
                          class="text-text-weak group-hover:text-text-strong shrink-0"
                        />
                        <div class="flex-1 min-w-0">
                          <div class="text-14-medium text-text-strong truncate">{project.name}</div>
                          <div class="text-12-regular text-text-weak truncate">
                            {project.path.replace(workspacePath(), ".")}
                          </div>
                        </div>
                        <Icon
                          name="arrow-right"
                          size="small"
                          class="text-text-weak opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </div>

        <div class="mt-4 pt-4 border-t border-border-weak-base">
          <Show when={!showCreateForm()}>
            <Button
              size="large"
              class="w-full"
              icon="plus"
              onClick={() => {
                setShowCreateForm(true)
                setError(null)
              }}
            >
              {language.t("dialog.scriptProject.newProject")}
            </Button>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}
