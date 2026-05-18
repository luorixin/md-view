# Docker 部署说明

## 构建并启动

```bash
docker compose up -d --build
```

启动后访问：

```text
http://服务器IP:3000
```

## 常用命令

```bash
docker compose logs -f
docker compose restart
docker compose down
```

## 单独使用 Docker

```bash
docker build -t md-server:latest .
docker run -d --name md-server --restart unless-stopped -p 3000:3000 md-server:latest
```

## 说明

- 镜像使用 Next.js `standalone` 输出，运行时只复制必要产物。
- `docs/` 会被复制进镜像，因为全文搜索页面运行时需要读取 Markdown 内容。
- 默认容器端口是 `3000`，服务器已有反向代理时可将 Nginx/Caddy 转发到 `127.0.0.1:3000`。
- `package.json` 已固定 `packageManager: pnpm@10.27.0`，Dockerfile 也会激活同一 pnpm 版本，避免不同构建机拿到不同 pnpm 行为。
- `package.json` 和 `pnpm-workspace.yaml` 已显式允许 `esbuild` 和 `sharp` 运行安装构建脚本，用于兼容 pnpm 10 的 build approval 机制；不需要在 Docker 构建时交互执行 `pnpm approve-builds`。

## GitHub Actions 工作流

仓库已包含三条工作流：

- `create-release-branch.yml`
  `push main` 后自动创建一个新的 `release/<版本号>` 分支，并在该分支生成一个 release 元数据提交，再立即创建对应的 draft PR
- `create-release-pr.yml`
  `release/*` 分支后续有新增提交时，作为兜底逻辑自动补建/补齐指向 `main` 的 draft PR
- `deploy-on-release-merge.yml`
  任意 `release/*` 分支通过 PR 合并回 `main` 后，自动 SSH 到服务器执行部署

### 推荐协作方式

1. `main` 作为线上稳定分支
2. 每次 `main` 更新后，GitHub Actions 自动创建一个新的发布候选分支，例如 `release/v20260515-1030-a1b2c3d`
3. 工作流会在该分支生成 `.release/release.json`，形成一个带版本号的 release 提交，并立即创建 draft PR
4. 团队在这个 `release/*` 分支上继续补充发布相关修改，或从它再切功能/修复分支
5. PR 合并后，GitHub Actions 自动登录服务器并执行部署

这样做的好处是：

- 不会强制覆盖一个固定的 `release` 分支
- 每次发布周期都有独立分支，方便回看和审计
- 多人同时协作时，不容易互相踩掉发布准备中的改动
- 发布 PR 有固定模板和检查项，减少临上线时漏项
- 部署前会在服务器保存一次现场信息，并在部署后做健康检查

### 需要配置的 GitHub Secrets

- `SSH_HOST`
  服务器地址
- `SSH_PORT`
  服务器 SSH 端口，可选，默认 `22`
- `SSH_USER`
  服务器登录用户
- `SSH_PRIVATE_KEY`
  GitHub Actions 用于登录服务器的私钥
- `DEPLOY_PATH`
  服务器上的项目目录，例如 `/srv/md-server`
- `SSH_KNOWN_HOSTS`
  可选，服务器 `known_hosts` 内容；配置后会启用严格主机校验
- `HEALTHCHECK_URL`
  可选，默认 `http://127.0.0.1:3000/api/health`
- `RELEASE_PR_TOKEN`
  可选但强烈建议配置。用于创建 release PR 的 GitHub Token；当仓库关闭 “Allow GitHub Actions to create and approve pull requests” 时，需要提供这个 secret。建议使用具备 `contents: write` 和 `pull requests: write` 权限的 Fine-grained PAT。

### 需要确认的 GitHub Actions 仓库设置

- 如果不配置 `RELEASE_PR_TOKEN`，需要在仓库 `Settings -> Actions -> General` 中开启 `Allow GitHub Actions to create and approve pull requests`
- 如果该选项不能开启，或组织策略禁止使用默认 `GITHUB_TOKEN` 创建 PR，就配置 `RELEASE_PR_TOKEN` 作为替代

### 服务器目录要求

目标目录里需要提前准备好：

- 项目 Git 仓库
- Docker 和 Docker Compose
- 当前仓库的 `.env` 或其他运行配置

部署动作执行的是：

```bash
mkdir -p .deploy-backups/<timestamp>
git rev-parse HEAD > .deploy-backups/<timestamp>/pre-deploy-revision.txt
docker compose config > .deploy-backups/<timestamp>/compose.rendered.yml
curl -fsS http://127.0.0.1:3000/api/health > .deploy-backups/<timestamp>/pre-deploy-health.json || true
git fetch --all --prune
git checkout main
git pull origin main
docker compose up -d --build
curl -fsS http://127.0.0.1:3000/api/health
```

工作流里的远程部署脚本通过 SSH 参数显式传入 `DEPLOY_PATH` 和 `HEALTHCHECK_URL`，避免 here-document 在 GitHub Runner 本地提前展开变量。若这两个值为空，工作流会在连接服务器前直接失败并给出提示。
