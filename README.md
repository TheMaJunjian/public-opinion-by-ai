# 公论 (Public Discourse) — 非线性公共讨论平台

> *一切记录在案，是非自有公论。*

**公论**是一套面向真实世界的非线性公共讨论系统，结合 AI 辅助与贡献点数字货币激励机制，让集体讨论、判断与决策变得高效、透明、可追溯。

## 核心理念

| 特性 | 说明 |
|------|------|
| **非线性表结构** | 消息可同时引用多条其他消息，讨论形成有向图而非线性列表 |
| **关系即消息** | 消息之间的关系本身也是一条消息，可被引用、讨论 |
| **贡献点** | 参与、发言、整理信息均可获得贡献点（平台内数字货币） |
| **立场聚合** | 对任意消息支持/反对/报名，聚合统计群体观点 |
| **预测对赌** | 对观点押注贡献点，结果由事实验证，胜者获得败者筹码 |
| **AI 辅助** | 自动摘要线程、聚类相关话题、自动分类消息 |
| **永久记录** | 所有消息修改均保留历史，不可抵赖 |

## 快速开始

```bash
npm install
npm start
# 访问 http://localhost:3000
```

服务启动时自动注入一批演示数据，可直接体验所有功能。

### 环境变量（可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `OPENAI_API_KEY` | 启用真实 AI（摘要/聚类/分类） | 空（使用规则退化） |
| `OPENAI_BASE_URL` | OpenAI 兼容 API 地址 | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | 模型名称 | `gpt-4o-mini` |

## REST API

### 用户

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/users` | 列出所有用户 |
| `POST` | `/api/users` | 创建用户 `{ name }` |
| `GET` | `/api/users/:id` | 获取用户详情 |
| `POST` | `/api/users/:id/points` | 调整贡献点 `{ delta }` |

### 消息

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/messages` | 列出消息（支持 `?tag=&type=&authorId=`） |
| `POST` | `/api/messages` | 发送消息 `{ authorId, content, references[], type, relationType, tags[] }` |
| `GET` | `/api/messages/graph` | 导出图结构 `{ nodes, edges }` |
| `GET` | `/api/messages/:id` | 获取单条消息 |
| `PATCH` | `/api/messages/:id` | 编辑消息（保留历史） |
| `GET` | `/api/messages/:id/thread` | 获取以此消息为根的讨论树 |
| `POST` | `/api/messages/:id/summarize` | AI 摘要该线程 |
| `POST` | `/api/messages/cluster` | AI 聚类所有消息 |

### 立场

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/positions` | 列出立场（支持 `?messageId=&userId=`） |
| `POST` | `/api/positions` | 表明立场 `{ userId, messageId, type: support\|oppose\|signup, stake? }` |

### 预测对赌

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/wagers` | 列出预测（支持 `?messageId=&status=`） |
| `POST` | `/api/wagers` | 创建预测 `{ messageId, creatorId, prediction, amount, resolvesAt? }` |
| `POST` | `/api/wagers/:id/join` | 加入对赌 `{ userId, amount }` |
| `POST` | `/api/wagers/:id/resolve` | 裁定结果 `{ outcome: true\|false }` |

## 运行测试

```bash
npm test
```

## 技术栈

- **后端**: Node.js + Express（无数据库，纯内存存储，可替换为 SQLite/PostgreSQL）
- **前端**: 原生 JavaScript + D3.js（力导向图）
- **AI**: OpenAI 兼容 API（有规则退化，无需 API Key 也可运行）
- **测试**: Jest + Supertest（22 个测试用例）
