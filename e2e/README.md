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

当前 92 条用例；下单验收按 [O1–O17 映射](perps/acceptance.md)、资金验收按
[README 7.3 的 F1–F17 映射](perps/funding-acceptance.md)、历史页验收按
[README 7.3 的 H1–H14 映射](perps/history-acceptance.md)、首页验收按
[README 7.3 的 A1–A11 映射](perps/tab-acceptance.md)、市场页验收按
[README 7.3 的 S1–S15 映射](perps/markets-acceptance.md)、详情页验收按
[README 7.3 的 M1–M14 映射](perps/market-detail-acceptance.md)维护。资金用例包含 4 条记录已知缺口的预期失败，不能算作验收通过：

| 测试文件 | 数量 | 场景 |
| --- | --- | --- |
| `perps.spec.ts` | 3 | 市场与行情更新、IOC 开仓及签名、订单响应丢失后禁止重复提交并查询原 cloid |
| `funding.spec.ts` | 7 | 入金精度/下限/余额/MAX、取消确认后重新准备并广播、gas 不足、源链回滚；提现费上涨后重新确认、统一账户现货可用余额、MAX 余额下降、提现响应丢失 |
| `funding-acceptance.spec.ts` | 22 | 账户模式/其他资金池、大额精确金额、异常报价、gas 最小单位边界、刷新/MAX、报价涨跌与授权复用；费用吞掉入金金额的闸门缺口 |
| `funding-recovery.spec.ts` | 14 | 原字节重播/端点轮换/整批断线/原哈希追踪、提现 nonce/余额拒绝/未知响应/挂起、取消报价竞态、stale 旧账户、重载后无持久恢复 |
| `complex-orders.spec.ts` | 7 | 多空 TP/SL 的方向校验与父子单、父单成交但保护单拒绝、部分成交、部分后全部平仓、模式同步后容量归零、杠杆写入拒绝 |
| `order-acceptance.spec.ts` | 16 | 普通/加仓/平仓入口、cross 路由、精度与保证金、方向容量、反向净仓、尾数全平、独立杠杆、HIP-3 费率、TP/SL 单位联动 |
| `order-recovery.spec.ts` | 11 | partial + waitingForFill、已接受订单的响应丢失/503/畸形答复及恢复、心跳超时重连、离开后的写入回调、首次模式同步的容量等待与拦截 |
| `history-acceptance.spec.ts` | 2 | H1 五类历史按需加载与缓存、成交 WS 快照；H3 三类归档 200 条渲染上限 |
| `tab-acceptance.spec.ts` | 2 | A3 统一账户余额/冻结额，A4 单 DEX 失败时保留已有仓位并禁用资金入口 |
| `markets-acceptance.spec.ts` | 4 | S1/S2/S8 搜索与分批分页；S4/S5/S9 行情更新、重新排序与缺价；S10 HIP-3 完整 coin 路由；S11 部分 DEX 失败提示 |
| `market-detail-acceptance.spec.ts` | 4 | M1/M2 切币搜索和 HIP-3 身份；M3 价格、统计与 mark 降级；M4 周期参数和偏好恢复；M11/M12 仓位显示及下单入口导航 |

HTTP 在网络边界模拟。WebSocket 使用 `addInitScript` 安装协议替身，捕获创建 socket 的
Angular zone，测试推送帧时回到该 zone，保证实际页面刷新。这与参考实现的方法一致，
不依赖新版 Playwright 的 `routeWebSocket`，也不调用组件或 Service 的私有方法。
未知外部请求和连接会被阻断并令测试失败；实际业务计算、签名、路由及页面渲染保持真实。
模拟服务会在 `updateLeverage` 成功后更新保证金模式和杠杆，并在后续查询中返回新状态，
以覆盖应用提交订单前的容量复核。

资金通道的 `funding.fake.ts` 模拟 Arbitrum Sepolia RPC、HyperEVM Testnet RPC 和 Circle
报价。USDC EIP-712 授权、EVM 原始交易、Hyperliquid 提现动作都由应用真实签署；测试独立
恢复签名并解码目标合约、链 ID、金额、CCTP domain、转发器、hook data 和费用上限。
入金的开户费只计入到账估算，不进入 CCTP `maxFee`。源链回执成功仅刷新源链余额，
不会在模拟中自动增加 HyperCore 余额。

```sh
npm run e2e:headed
npm run e2e -- --grep 'lost response'
npm run e2e -- funding.spec.ts
npm run e2e -- funding-acceptance.spec.ts funding-recovery.spec.ts
npm run e2e -- complex-orders.spec.ts
npm run e2e -- --grep 'O17'
npm run e2e:report
```

每条测试保存最终页面截图、版本/环境信息及带时间的原始协议请求/响应（资金包含 RPC 答复与 Circle 报价）；失败额外保存 trace
和失败截图。O2 另附计算输入及表单截图。产物在根目录 `test-results/` 和
`playwright-report/`，均不提交。trace 会记录测试钱包输入，因此这套测试只使用临时生成
的无资金密钥。测试不自动重试、不依赖真实交易所或链 RPC、不使用固定 sleep。

范围：与参考实现一样，这一版运行于网页环境，覆盖 `ChromeService` 的本地存储分支。
它不覆盖扩展后台通信、真实交易所验签/成交、真实跨链到账或组合保证金风险模型。
HIP-3 已覆盖协议 coin/assetId 和下单费率；真实方向容量口径与小额退出条件（O15/O16）仍待测试网验收。
统一账户提现只验证当前实现的现货 `total - hold` 上限与 `sourceDex: 'spot'`，不代表所有
持仓/借贷情况下的真实可提额度。当前界面没有限价单控件，因此不通过调用内部方法伪造
限价 E2E。提现响应丢失用例验证提示与不自动重发；当前页面并不永久禁止用户再次提现。
F14–F17 的真实到账、回补、激活费与风险限制，以及准备完成后的钱包绑定仍待验收。
现有 `npm run lint`、`npm run test:ci` 仍应照常执行。
