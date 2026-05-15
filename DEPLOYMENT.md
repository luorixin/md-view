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
