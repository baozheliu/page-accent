# 架构说明

Page Accent 按职责拆成四层：

1. `src/manifest.config.js`：按目标浏览器生成扩展能力、入口页面、权限和注入规则。
2. `src/extension/`：通用基础设施，只放与扩展平台相关的可复用能力。
3. `src/background/`、`src/content/`、`src/pages/`：具体运行环境入口。
4. `src/shared/`：业务可复用的纯函数、常量和类型约定。

## 运行环境

- `background`：Manifest V3 service worker，适合处理安装初始化、跨页面通信、上下文菜单、定时任务、网络协调等。
- `content`：注入目标网页的脚本，适合读取 DOM、监听页面变化、与页面上下文交互。
- `popup`：点击扩展图标后打开的小窗口，适合轻量操作。
- `options`：扩展配置页，适合较完整的设置。
- `side-panel`：浏览器侧边栏页面，适合长流程、列表和持续交互。

## 新增消息的步骤

1. 在 `src/extension/messaging.js` 的 `ExtensionMessage` 中新增消息名。
2. 如消息有 payload，给 `addRuntimeMessageHandlers()` 传入对应 validator。
3. 在接收端使用 `addRuntimeMessageHandlers()` 注册 handler。
4. 在发送端使用 `sendRuntimeMessage()` 或 `sendTabMessage()`。
5. handler 返回普通对象或 Promise，工具层会包装为 `{ ok: true, data }`；异常会包装为 `{ ok: false, error }` 并在发送端抛出。

## 新增页面的步骤

1. 在 `src/pages/your-page/` 下添加 `index.html`、`main.js`、`App.vue`。
2. 在 `src/extension/config.js` 和 `src/manifest.config.js` 中把页面路径注册到对应入口。
3. 共用样式从 `src/styles/base.css` 引入。

## 权限与数据流

- `storage` 保存设置、颜色标记和规则。
- `activeTab`、`tabs` 和 `contextMenus` 支持用户主动标记、标签页同步和右键操作。
- Chromium 使用 `sidePanel` 与可选的 `tabGroups` 同步；Firefox 使用 `sidebar_action`。
- 内容脚本需要覆盖 HTTP/HTTPS 页面，以显示颜色线、角标并把当前 URL/标题与本地规则匹配。它不读取或上传页面正文。
- 扩展没有开发者后端、遥测或远程可执行代码。

## MV3 状态约定

Manifest V3 service worker 可能被浏览器随时回收，不要把关键状态只放在模块级变量里。短生命周期 UI 状态优先使用 `chrome.storage.session`，持久设置使用 `createExtensionStorage()` 的 local/sync 区域。

## 工程化检查

- `npm run validate:manifest`：校验各目标浏览器的 manifest 权限和能力差异。
- `npm run check`：校验 manifest、运行测试并执行生产构建。
