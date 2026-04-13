# public-opinion-by-ai

public-opinion by ai

---

## Copilot Coding Agent 自动提交与 PR 配置

本仓库已配置 GitHub Actions 工作流，支持 Copilot coding agent 自动在分支上提交代码、自动向 `main` 发起 Pull Request。

### 快速开始

1. **配置仓库权限**（⚠️ 必须完成，否则 Actions 会报 403）
   - 进入 **Settings → Actions → General**
   - 将 **Workflow permissions** 设置为 **Read and write permissions**
   - 勾选 **Allow GitHub Actions to create and approve pull requests**
   - 点击 **Save**

2. **手动触发演示工作流**
   - 进入 **Actions → Copilot Agent Demo - Auto Branch & PR**
   - 点击 **Run workflow**，可选填分支后缀和 PR 标题
   - 工作流将自动创建新分支、提交示例文件、开出 Pull Request

### 工作流文件

| 文件 | 说明 |
|------|------|
| [`.github/workflows/copilot-agent-demo.yml`](.github/workflows/copilot-agent-demo.yml) | 演示工作流：手动触发 → 新建分支 → 提交文件 → 创建 PR |

### 详细文档

📖 [docs/copilot-agent-setup.md](docs/copilot-agent-setup.md) — 包含完整的权限配置步骤、分支保护规则建议、常见失败原因排查、以及 Copilot coding agent 落地通道说明。
