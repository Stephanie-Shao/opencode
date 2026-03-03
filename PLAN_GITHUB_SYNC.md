# 方案B：项目列表新增"同步到 GitHub"按钮

## Context

用户已在 `user_friendly` 分支实现了「创建项目时自动执行 git init」功能。下一步需要为用户提供将本地项目推送到 GitHub 的能力。按照方案 B 的设计：在项目列表每行旁边放置一个 GitHub 图标按钮，点击后弹出配置弹窗，填写 GitHub Token（本地持久化），自动调用 GitHub API 创建同名仓库，然后执行 git add / commit / remote add / push。

---

## 实现步骤

### Step 1：后端 — 新增 `POST /file/github-sync` 路由

**文件**: `packages/opencode/src/server/routes/file.ts`

在现有的 `.post("/file/mkdir", ...)` 下方新增路由：

```typescript
.post(
  "/file/github-sync",
  validator("json", z.object({
    path: z.string(),       // 项目绝对路径
    repoName: z.string(),   // GitHub 仓库名
    token: z.string(),      // GitHub Personal Access Token
  })),
  async (c) => {
    const { path: projectPath, repoName, token } = c.req.valid("json")

    // 安全检查
    if (!Instance.containsPath(projectPath)) {
      return c.json({ error: "Access denied" }, 403)
    }

    // 1. 调用 GitHub API 创建仓库
    const createRes = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: repoName, private: false, auto_init: false }),
    })
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}))
      return c.json({ error: (err as any).message || "Failed to create repo" }, 400)
    }
    const repo = await createRes.json() as { clone_url: string; html_url: string }

    // 2. git config user (避免 commit 失败)
    await git(["config", "user.email", "opencode@users.noreply.github.com"], { cwd: projectPath })
    await git(["config", "user.name", "opencode"], { cwd: projectPath })

    // 3. git add .
    const addResult = await git(["add", "."], { cwd: projectPath })
    if (addResult.exitCode !== 0) {
      return c.json({ error: "git add failed" }, 500)
    }

    // 4. git commit（允许 nothing to commit 的情况）
    await git(["commit", "--allow-empty", "-m", "Initial commit"], { cwd: projectPath })

    // 5. git remote add origin
    const remoteUrl = repo.clone_url.replace("https://", `https://${token}@`)
    await git(["remote", "add", "origin", remoteUrl], { cwd: projectPath })

    // 6. git push -u origin main（尝试 main，失败则 master）
    let pushResult = await git(["push", "-u", "origin", "main"], { cwd: projectPath })
    if (pushResult.exitCode !== 0) {
      pushResult = await git(["push", "-u", "origin", "master"], { cwd: projectPath })
    }
    if (pushResult.exitCode !== 0) {
      return c.json({ error: "git push failed" }, 500)
    }

    return c.json({ success: true, repoUrl: repo.html_url })
  }
)
```

**依赖**（已有）：
- `git` from `../../util/git`
- `Instance` from `../../project/instance`
- `validator`, `z` already imported

---

### Step 2：前端 — Token 持久化存储

**文件**: `packages/app/src/context/server.tsx`

利用现有的 `persisted` + `Persist.global` 模式，在 `ServerProvider` 中添加 GitHub token 存储：

```typescript
// 在 server.tsx 中新增，与现有 store 并列
const [githubStore, setGithubStore] = persisted(
  Persist.global("github", ["github.v1"]),
  createStore({ token: "" as string })
)
```

并通过 context 暴露 `githubToken` 和 `setGithubToken`。

---

### Step 3：前端 — 修改项目列表 UI

**文件**: `packages/app/src/components/dialog-open-project.tsx`

#### 3a. 新增状态变量
```typescript
const [syncingProject, setSyncingProject] = createSignal<string | null>(null)
const [showTokenInput, setShowTokenInput] = createSignal(false)
const [pendingSyncPath, setPendingSyncPath] = createSignal<string | null>(null)
const [githubToken, setGithubToken] = createSignal(server.github.token || "")
```

#### 3b. 在每个项目行旁边添加 GitHub 同步按钮

在 `<For each={projects()}>` 的 `<li>` 内，`arrow-right` 图标前添加：
```tsx
<button
  class="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-raised-base transition-all"
  title={language.t("dialog.scriptProject.syncToGitHub")}
  onClick={(e) => {
    e.stopPropagation()
    setPendingSyncPath(project.path)
    const savedToken = server.github.token
    if (savedToken) {
      // 已有保存的 Token，直接同步，无需弹窗
      setGithubToken(savedToken)
      handleGitHubSyncWith(project.path, savedToken, project.name)
    } else {
      // 首次使用，弹出 Token 输入框
      setShowTokenInput(true)
    }
  }}
>
  <Icon name="github" size="small" class="text-text-weak hover:text-text-strong" />
</button>
```

**关键逻辑**：
- 已保存 Token → 直接同步，不弹框
- 无 Token（首次）→ 弹出输入框，填写后保存并同步

#### 3c. Token 输入弹窗（条件渲染）

在 `<Show when={showCreateForm()}>` 下方新增：
```tsx
<Show when={showTokenInput()}>
  <div class="mb-6 p-4 bg-surface-base rounded-lg border border-border-weak-base">
    <div class="text-14-medium text-text-strong mb-3">
      {language.t("dialog.scriptProject.syncToGitHub")}
    </div>
    <div class="flex flex-col gap-2">
      <input
        type="password"
        placeholder={language.t("dialog.scriptProject.githubTokenPlaceholder")}
        class="px-3 py-2 bg-surface-base text-text-strong text-14-regular border border-border-weak-base rounded-md ..."
        value={githubToken()}
        onInput={(e) => setGithubToken(e.currentTarget.value)}
      />
      <div class="text-12-regular text-text-weak">
        {language.t("dialog.scriptProject.githubTokenHint")}
      </div>
      <div class="flex gap-3 mt-1">
        <Button size="normal" onClick={handleGitHubSync} disabled={syncingProject() !== null}>
          <Show when={syncingProject() === null} fallback={language.t("common.syncing")}>
            {language.t("dialog.scriptProject.syncConfirm")}
          </Show>
        </Button>
        <Button size="normal" variant="ghost" onClick={() => setShowTokenInput(false)}>
          {language.t("common.cancel")}
        </Button>
      </div>
    </div>
  </div>
</Show>
```

#### 3d. handleGitHubSync 函数

```typescript
const handleGitHubSync = async () => {
  const path = pendingSyncPath()
  const token = githubToken().trim()
  if (!path || !token) return

  const project = projects().find(p => p.path === path)
  if (!project) return

  setSyncingProject(path)
  // 持久化保存 token
  server.setGithubToken(token)

  try {
    const response = await fetch(`${sdk.url}/file/github-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, repoName: project.name, token }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error((err as any).error || response.statusText)
    }
    const data = await response.json()
    showToast({ variant: "success", title: language.t("dialog.scriptProject.syncSuccess") })
    setShowTokenInput(false)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    showToast({ variant: "error", title: `${language.t("dialog.scriptProject.syncError")}: ${msg}` })
  } finally {
    setSyncingProject(null)
  }
}
```

---

### Step 4：i18n — 新增翻译 Key

**文件**: `packages/app/src/i18n/en.ts` 和 `zh.ts`

新增以下 key（放在现有 `dialog.scriptProject.*` 区块内）：

| Key | English | 中文 |
|-----|---------|------|
| `dialog.scriptProject.syncToGitHub` | `Sync to GitHub` | `同步到 GitHub` |
| `dialog.scriptProject.githubTokenPlaceholder` | `GitHub Personal Access Token` | `GitHub Personal Access Token` |
| `dialog.scriptProject.githubTokenHint` | `Token requires repo scope. It will be saved locally.` | `Token 需要 repo 权限，将保存在本地` |
| `dialog.scriptProject.syncConfirm` | `Sync` | `开始同步` |
| `dialog.scriptProject.syncSuccess` | `Successfully pushed to GitHub` | `已成功推送到 GitHub` |
| `dialog.scriptProject.syncError` | `Sync failed` | `同步失败` |
| `common.syncing` | `Syncing...` | `同步中...` |

---

## 关键文件路径

| 文件 | 修改内容 |
|------|---------|
| `packages/opencode/src/server/routes/file.ts` | 新增 `POST /file/github-sync` 路由 |
| `packages/app/src/context/server.tsx` | 新增 GitHub token 的 `persisted` 存储 |
| `packages/app/src/components/dialog-open-project.tsx` | 新增同步按钮、Token 输入表单、handleGitHubSync |
| `packages/app/src/i18n/en.ts` | 新增 i18n key |
| `packages/app/src/i18n/zh.ts` | 新增 i18n key（中文） |

## 可复用的现有工具

- `git()` — `packages/opencode/src/util/git.ts`：已封装好的 git 命令执行器
- `persisted()` + `Persist.global()` — `packages/app/src/utils/persist.ts`：本地持久化存储
- `showToast()` — `@opencode-ai/ui/toast`：统一 toast 通知
- `validator` + `z` — Hono + Zod：路由参数校验（file.ts 中已有引入）

## 验证方式

1. 创建一个新项目，进入项目列表
2. hover 项目行，确认右侧出现 GitHub 图标按钮
3. 点击按钮，确认弹出 Token 输入框（首次）
4. 输入有效 GitHub PAT，点击「开始同步」
5. 确认 GitHub 上自动创建了同名仓库，并有初始提交
6. 确认 toast 显示「已成功推送到 GitHub」
7. 再次点击同步按钮，确认直接同步（无弹框）
8. 输入无效 Token，确认显示错误 toast
