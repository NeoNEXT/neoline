# Perps E2E

与项目统一使用根目录 `.nvmrc` 的 **Node 16.20.1 / npm 8.19.4**，依赖和锁文件也在
根目录。Playwright 固定为 **1.44.1**，与[参考分支](https://github.com/haiwulei/neoline-perps/tree/feature/perps/e2e)一致，支持 Node 16。
不需要进入 e2e 目录安装另一个 Node 或另一套依赖。

```sh
nvm use
npm ci
npx playwright install chromium
npm run e2e:typecheck
npm run e2e
```

Playwright 自动启动并关闭 `127.0.0.1:4300` 上的 Angular 开发服务器；该端口需要空闲。
专用 Angular `e2e` 配置使用 `environment.e2e.ts`，固定 Perps 测试网，不改开发配置。
浏览器使用全新 context，测试通过实际 UI 导入随机无资金钱包、锁定、解锁，再操作 Perps。

当前三条用例：

1. NeoX 钱包进入 Perps → ETH 详情，验证账户金额与 WebSocket 行情更新。
2. 默认逐仓模式市价做多，验证杠杆写入、IOC 价格/数量/方向、cloid、nonce、真实签名地址，以及成交后的仓位和可用保证金。
3. 快速点击两次提交并丢弃订单响应，验证未知状态、禁止再次下单；自动查询和手动重查始终使用原 cloid，只有一笔订单请求。

HTTP 在网络边界模拟。WebSocket 使用 `addInitScript` 安装协议替身，捕获创建 socket 的
Angular zone，测试推送帧时回到该 zone，保证实际页面刷新。这与参考实现的方法一致，
不依赖新版 Playwright 的 `routeWebSocket`，也不调用组件或 Service 的私有方法。
未知外部请求和连接会被阻断并令测试失败；实际业务计算、签名、路由及页面渲染保持真实。
模拟服务会在 `updateLeverage` 成功后更新保证金模式和杠杆，并在后续查询中返回新状态，
以覆盖应用提交订单前的容量复核。

```sh
npm run e2e:headed
npm run e2e -- --grep 'lost response'
npm run e2e:report
```

失败时保存 trace、截图；每条测试附带协议请求摘要。产物在根目录 `test-results/` 和
`playwright-report/`，均不提交。trace 会记录测试钱包输入，因此这套测试只使用临时生成
的无资金密钥。测试不自动重试、不依赖真实交易所或链 RPC、不使用固定 sleep。

范围：与参考实现一样，这一版运行于网页环境，覆盖 `ChromeService` 的本地存储分支。
它不覆盖扩展后台通信、真实交易所验签或真实成交，也尚未覆盖 HIP-3、统一账户和出入金。
这些属于后续独立测试层。现有 `npm run lint`、`npm run test:ci` 仍应照常执行。
