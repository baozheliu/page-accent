# Cloudflare Pages 免费部署手册

最后更新：2026-07-12

本文用于从 0 手工创建、配置、构建并部署 Cloudflare Pages 项目。当前项目的隐私政策页面已经采用静态目录方式部署，可作为后续重复操作模板。

## 1. 免费额度和有效期

Cloudflare Pages 免费版目前适合部署静态页面、文档页、隐私政策页、落地页和轻量前端应用。

截至 2026-07-12，官方页面显示的免费版要点如下：

- 费用：`$0`。
- 站点数量：Cloudflare Pages 定价页标注 `Unlimited sites`；平台限制页同时说明账号下 Pages 项目有 `100` 个软限制，用于防滥用。实操上建议按每个账号约 `100` 个 Pages 项目规划，超过后需要申请提额。
- 构建并发：`1` 个构建同时运行。
- 每月构建次数：`500` 次。
- 自定义域名：每个项目 `100` 个。
- 静态请求数：不限。
- 带宽：不限。
- 每个免费站点文件数量：最多 `20,000` 个文件。
- 单个静态资源文件大小：最大 `25 MiB`。
- 预览部署：同一项目可保留不限数量的活动预览部署。

免费版没有官方标注的固定到期时间；只要账号、项目和用量符合 Cloudflare 条款和平台限制，免费 Pages 项目可以长期使用。新账号或首次使用 Pages 的前 48 小时内，Cloudflare 可能限制新建 Pages 项目的数量，该限制通常会自动解除。

官方参考：

- https://pages.cloudflare.com/
- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/pages/get-started/

## 2. 当前项目参数

本仓库中的隐私政策页面是纯静态页面，不需要构建步骤。

- 项目目录：`privacy-site`
- 入口文件：`privacy-site/index.html`
- 静态资源：`privacy-site/assets/icon128.png`
- 既有生产 URL（旧项目名）：`https://tabmark-privacy.pages.dev/`
- 推荐新项目名：`page-accent-privacy`（对应 `https://page-accent-privacy.pages.dev/`）
- 构建命令：留空
- 构建输出目录：`privacy-site`

如果只是更新隐私政策内容，修改 `privacy-site/index.html` 后重新上传或重新部署即可。

## 3. 方式 A：网页后台 Direct Upload

这是最适合隐私政策页的方式，不需要 GitHub、GitLab 或本地 CLI。

1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 点击 `Create` 或 `Create application`。
4. 选择 `Pages`。
5. 选择 `Upload assets`、`Direct Upload` 或类似入口。
6. 输入项目名，例如 `page-accent-privacy`。
7. 上传整个 `privacy-site` 目录，确保上传内容包含：
   - `index.html`
   - `assets/icon128.png`
8. 点击部署。
9. 等待部署完成，打开 Cloudflare 给出的 `https://<project-name>.pages.dev/` 地址。
10. 检查页面可访问、图标正常显示、中文和英文内容都完整。

部署完成后，将生产 URL 填入浏览器扩展商店的隐私政策 URL 字段。

## 4. 方式 B：网页后台连接 Git

适合需要以后通过 `git push` 自动部署的项目。

1. 将代码推送到 GitHub 或 GitLab。
2. 打开 Cloudflare Dashboard。
3. 进入 `Workers & Pages`。
4. 点击 `Create` 或 `Create application`。
5. 选择 `Pages`。
6. 选择 `Connect to Git`。
7. 授权并选择目标仓库。
8. 选择生产分支，例如 `main`。
9. 构建配置填写：
   - Framework preset：`None`
   - Build command：留空
   - Build output directory：`privacy-site`
10. 保存并部署。
11. 部署完成后打开 `https://<project-name>.pages.dev/` 验证。

如果未来项目改成 Vite、React、Vue、Next 等需要构建的前端应用，需要改成对应配置。例如 Vite 常见配置为：

- Build command：`npm ci && npm run build`
- Build output directory：`dist`

## 5. 方式 C：Wrangler CLI 直接部署

适合希望从本机命令行重复部署，但不想绑定 Git 自动部署的场景。

首次使用：

```bash
npx wrangler login
```

从仓库根目录部署：

```bash
cd /path/to/page-accent
npx wrangler pages deploy privacy-site --project-name page-accent-privacy
```

如果项目不存在，Wrangler 可能提示创建项目；按提示确认即可。部署完成后，终端会输出生产或预览地址。

## 6. 自定义域名

不绑定自定义域名时，Cloudflare 会提供免费的 `*.pages.dev` 域名，已经足够用于扩展商店隐私政策 URL。

如需绑定自定义域名：

1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 选择目标 Pages 项目。
4. 打开 `Custom domains`。
5. 点击 `Set up a domain`。
6. 输入域名，例如 `privacy.example.com`。
7. 按 Cloudflare 提示确认 DNS。

注意：

- 如果绑定根域名，例如 `example.com`，该域名通常需要作为 Cloudflare zone 并将 nameserver 指向 Cloudflare。
- 如果绑定子域名，例如 `privacy.example.com`，可以添加 CNAME 指向 `<project-name>.pages.dev`。
- 仅手工添加 CNAME 不够，还需要在 Pages 项目的 `Custom domains` 页面完成域名关联，否则可能解析失败。

## 7. 发布前检查清单

每次部署隐私政策页前，检查以下项目：

- `privacy-site/index.html` 能在本地浏览器打开。
- 页面标题、最后更新时间、中文隐私政策和英文隐私政策都正确。
- 图标路径 `./assets/icon128.png` 正常。
- 页面中没有本不该出现的平台名称或商店名称。
- 生产 URL 能返回 `200`。
- 扩展商店后台填写的是生产 URL，不是预览 URL。

可用命令检查生产 URL：

```bash
curl -I https://page-accent-privacy.pages.dev/
```

期望看到 `HTTP/2 200` 或其他 2xx 状态。

## 8. 常见问题

### 页面部署后仍显示旧内容

等待几十秒后刷新；如果仍旧，检查是否访问了预览 URL 或浏览器缓存。也可以在 Cloudflare Pages 项目中查看最新 deployment 是否成功。

### Git 部署提示找不到输出目录

检查 `Build output directory` 是否填对。当前隐私页应填 `privacy-site`。如果把 `Root directory` 改成了 `privacy-site`，输出目录配置可能需要改为当前目录对应的值，建议优先保持仓库根目录作为 root，并把输出目录填 `privacy-site`。

### 上传后图片缺失

确认上传的是整个 `privacy-site` 文件夹的内容，而不是只上传 `index.html`。页面需要 `assets/icon128.png`。

### 免费额度不够

先检查是否是频繁提交触发了每月 `500` 次构建限制。Direct Upload 和 Git push 都可能产生部署记录。超过项目软限制或构建限制时，可在 Cloudflare 官方限制页面提交提额申请，或升级计划。

## 9. 后续维护建议

- 隐私政策 URL 应保持稳定，避免频繁更换扩展商店后台配置。
- 如果只是文字更新，优先直接更新当前 Pages 项目，不要新建项目。
- 每次修改隐私政策内容后，同步更新：
  - `docs/privacy-policy.md`
  - `docs/privacy-policy.en.md`
  - `privacy-site/index.html`
- 重要发布前，保留本地和 Cloudflare 当前 deployment 信息，方便回滚。
