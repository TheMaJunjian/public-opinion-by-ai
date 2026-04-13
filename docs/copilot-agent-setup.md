# Copilot Coding Agent 自动提交与 PR 配置说明

本文档说明如何配置仓库，使 GitHub Actions 工作流（以及 Copilot coding agent）具备自动提交代码、自动创建 Pull Request 的权限与能力。

---

## 一、仓库权限设置（必须完成，否则工作流会报 403）

### 1. 开启 Actions 写权限

1. 进入仓库页面 → **Settings**（设置）
2. 左侧菜单选择 **Actions → General**
3. 找到 **Workflow permissions** 板块
4. 选择 **Read and write permissions**
5. 点击 **Save**

> ⚠️ 默认值通常是 **Read repository contents and packages permissions**（只读），必须手动改为读写。

### 2. 允许 Actions 创建/批准 Pull Request

在同一个 **Actions → General** 页面中：

- 勾选 **Allow GitHub Actions to create and approve pull requests**
- 点击 **Save**

> 若不勾选此项，`gh pr create` 或 GitHub API 创建 PR 的步骤会失败。

---

## 二、工作流文件说明

工作流文件位于：`.github/workflows/copilot-agent-demo.yml`

### 触发方式

手动触发（**workflow_dispatch**）：

1. 进入仓库 → **Actions** 标签页
2. 左侧选择 **Copilot Agent Demo - Auto Branch & PR**
3. 点击 **Run workflow**
4. （可选）填写分支后缀和 PR 标题
5. 点击绿色 **Run workflow** 按钮

### 工作流执行流程

```text
手动触发
  │
  ├─ Checkout main
  ├─ 生成新分支名（copilot/agent-demo-<时间戳 或 自定义后缀>）
  ├─ 创建并切换到新分支
  ├─ 生成/更新 docs/agent-test.md
  ├─ git commit + git push
  └─ gh pr create → 向 main 发起 Pull Request
```

### 权限声明

工作流顶部已声明最小必要权限：

```yaml
permissions:
  contents: write      # 允许推送新分支
  pull-requests: write # 允许创建 PR
```

---

## 三、与 Copilot Coding Agent 的关系

Copilot coding agent（GitHub Copilot 自动编码代理）的工作模式与本工作流一致：

| 步骤 | Copilot Agent | 本工作流 |
|------|--------------|---------|
| 代码改动 | Agent 在 agent 专属分支上修改文件 | 工作流生成/修改 `docs/agent-test.md` |
| 提交 | Agent 自动 `git commit + push` | 工作流自动 `git commit + push` |
| 创建 PR | Agent 自动通过 API 创建 PR | 工作流通过 `gh pr create` 创建 PR |
| 审查 | 人工在 PR 页面 review 并合并 | 人工在 PR 页面 review 并合并 |

本工作流可作为验证"仓库权限配置是否正确"的最小测试用例。若工作流能成功运行并开出 PR，则说明 Copilot coding agent 也有足够权限运作。

---

## 四、分支保护规则建议

若仓库对 `main` 分支设置了保护规则（Branch Protection Rules），需要注意：

### 推荐配置

| 规则 | 建议值 | 说明 |
|------|--------|------|
| Require a pull request before merging | ✅ 开启 | 禁止直接 push 到 main，所有改动必须通过 PR |
| Required approvals | 1（或更多） | 由团队成员 review PR 后合并 |
| Allow specified actors to bypass required pull requests | 视情况 | 若需要 Actions 直接 push 则需配置，否则不建议 |
| Restrict who can push to matching branches | ✅ 开启 | 只允许指定人员/Actions 推送 |

### 注意事项

- Actions **不能直接 push 到受保护的 `main` 分支**（这是预期行为，更安全）
- Actions 可以 push 到新建的 feature/agent 分支，再通过 PR 合并到 main
- 若开启了 **"Require status checks to pass"**，需确保 PR 对应的 check 能通过

---

## 五、常见失败原因与排查

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `remote: Permission to ... denied` / `Error 403` | GITHUB_TOKEN 只读 | Settings → Actions → General → 改为 Read and write permissions |
| `gh: pull request create failed: 403` | 未允许 Actions 创建 PR | 勾选 Allow GitHub Actions to create and approve pull requests |
| `refusing to allow a GitHub App to create or update workflow files` | 分支保护或 App 权限不足 | 检查分支保护规则；或使用 Personal Access Token（PAT）替代 GITHUB_TOKEN |
| `fatal: branch 'copilot/agent-demo-...' not found` | push 失败导致分支不存在 | 先排查 push 步骤的日志 |
| `A pull request already exists for ...` | 同名分支已有开放 PR | 更换分支后缀后重试 |

---

## 六、使用 Personal Access Token（PAT）作为备用方案

若 `GITHUB_TOKEN` 仍受权限限制（例如组织级别策略），可使用 PAT：

1. **生成 PAT**：GitHub 个人设置 → Developer settings → Personal access tokens → Fine-grained tokens
   - 权限：`Contents: Read and write`、`Pull requests: Read and write`
2. **添加为仓库 Secret**：仓库 Settings → Secrets and variables → Actions → New repository secret，命名为 `MY_GH_TOKEN`
3. **修改工作流**：将 `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` 改为 `GH_TOKEN: ${{ secrets.MY_GH_TOKEN }}`

---

## 七、快速验证清单

完成上述配置后，按以下步骤验证：

- [ ] Settings → Actions → General → Workflow permissions = **Read and write permissions**
- [ ] Settings → Actions → General → **Allow GitHub Actions to create and approve pull requests** 已勾选
- [ ] 手动触发 `copilot-agent-demo.yml` 工作流
- [ ] 工作流运行成功（绿色 ✅）
- [ ] 仓库 Pull Requests 页面出现新的自动创建的 PR
- [ ] PR 中包含 `docs/agent-test.md` 的变更

若以上全部通过，则 Copilot coding agent 的自动提交与 PR 流程已配置完成。
