# Contributing

感谢你对 Page Accent 的兴趣。欢迎 Issue 与 Pull Request。

## 开发环境

- Node.js 18+
- npm 9+

```bash
npm install
npm run dev
npm run check
```

在浏览器扩展管理页加载 `dist/`，验证受影响的 popup、设置页、侧边栏和网页标识流程。

## 提交前检查

1. `npm run check` 通过。
2. 不提交密钥、Token、Cookie、本机路径、个人隐私或第三方未授权源码。
3. 权限或数据处理方式变化时，同步更新 README 和隐私政策。
4. UI 变化应提供截图；浏览器兼容性变化应说明 Chrome、Edge 或 Firefox 的影响。

提交标题建议遵循 [Conventional Commits](https://www.conventionalcommits.org/)：
`feat:`、`fix:`、`docs:`、`refactor:`、`test:` 或 `chore:`，后接简洁的祈使句说明。

参与本项目即表示你同意遵守 [Code of Conduct](./CODE_OF_CONDUCT.md)。
