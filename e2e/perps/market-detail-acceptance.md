# Perps 单市场详情页 7.3 验收映射

依据：[market/:coin README 第 7.3 节](../../src/app/popup/perps/perps-market/README.md#73-可复现验收方案自动化部分执行真实行情未执行)。浏览器测试使用真实 Angular 页面、路由和随机无资金钱包，在 HTTP/WS 边界使用固定替身；不能据此声称真实交易所行情、账户或交易结果已通过。

## 运行

```sh
nvm use
npm run e2e:typecheck
npm run e2e -- market-detail-acceptance.spec.ts
npm run lint
npm run test:ci -- \
  --include='src/app/popup/perps/perps-market/*.spec.ts' \
  --include='src/app/popup/perps/perps-market-list/*.spec.ts' \
  --include='src/app/popup/perps/perps-chart/*.spec.ts' \
  --include='src/app/core/services/perps/perps-market-dataset.service.spec.ts' \
  --include='src/app/core/services/perps/perps-candle-dataset.service.spec.ts' \
  --include='src/app/core/services/perps/perps-dataset.spec.ts' \
  --include='src/app/core/services/perps/perps-data-channel.service.spec.ts' \
  --include='src/app/core/services/perps/perps-account-state*.spec.ts' \
  --include='src/app/core/services/perps/hyperliquid.service.spec.ts' \
  --include='src/app/popup/perps/perps.util.spec.ts' \
  --reporters=dots
```

## 覆盖与限制

| 编号 | 自动化证据 | 未覆盖范围 |
| --- | --- | --- |
| M1–M2 | [详情页浏览器验收][detailE2e]从首页打开 ETH，验证切币搜索本地过滤、关闭后清词，再切换到 `xyz:TSLA`；核对标题 DEX、元数据请求、K 线请求及 activeAssetCtx 订阅身份 | 从仓位卡进入、同名跨 DEX 的可见区分、真实 DEX 请求未执行 |
| M3 | [详情页浏览器验收][detailE2e]核对 mid、24h 涨幅、成交额、OI、预言机价格；实时帧使 mid 缺失时退到 mark 并显示标签，mid/mark 都无效时显示 N/A；[组件测试][component]补充非法数值和更多价格类型边界 | 实盘 prevDayPx、OI 及资金费口径未对照；无价格仍允许进入下单表单，提交校验由下单页负责 |
| M4 | [详情页浏览器验收][detailE2e]选择 `1h`/`1w` 并核对原样请求值，离页重入后验证 `1w` 偏好恢复；[组件测试][component]覆盖全部周期、存储值校验和路由变化 | 浏览器未注入异步存储失败或旧存储晚到覆盖新选择 |
| M5–M8 | [组件测试][component]和[K 线数据集测试][candle]覆盖切币清图、请求配给、快照/帧竞态、前插/重复末柱与历史翻页；[图表测试][chart]覆盖视口、量柱和时间展示 | 本组没有浏览器级延迟快照、缩放/拖动视口、历史空页/失败和稀疏市场注入 |
| M9–M10 | [通道测试][channel]、[市场数据集测试][market]及组件测试覆盖 stale/重连交接、补缺、市场 missing 与刷新失败后保留旧流 | 真实断线、真实重连和服务端市场事实变化未执行 |
| M11 | [详情页浏览器验收][detailE2e]展示匹配的 ETH 多头仓位，核对数量和 Add/Close 入口；[组件测试][component]补充空仓/空头与仓位匹配 | 浏览器未覆盖多 DEX 部分账户失败及真实地址切换 |
| M12 | [详情页浏览器验收][detailE2e]核对加仓入口导航到完整 coin 的表单，并断言没有 exchange 写入；缺价时仍能进入表单的现状也有覆盖 | Connecting/stale 的浏览器门禁及另外三个入口未在本组重跑；下单、签名和成交由下单验收负责 |
| M13 | [组件测试][component]、[账户服务测试][account]和数据集测试覆盖地址变更隔离、销毁退订与共享读取回收 | 页面浏览器级钱包切换/清空和真实在途网络响应未执行 |
| M14 | README 保留外部接口和官方前端对照步骤 | 本次未连接真实行情或跨资金费结算点采样，不计作通过 |

## 本次运行结果

Node `16.20.1`、npm `8.19.4`、ChromeHeadless `154`、Playwright `1.44.1`。新增 **4 条详情页浏览器验收通过**，README 定向组件/服务/图表测试 **334 项通过**，E2E TypeScript 检查及 `npm run lint` 通过。真实行情、账户、断线和交易所行为未执行。

[detailE2e]: ./market-detail-acceptance.spec.ts
[component]: ../../src/app/popup/perps/perps-market/perps-market.component.spec.ts
[market]: ../../src/app/core/services/perps/perps-market-dataset.service.spec.ts
[candle]: ../../src/app/core/services/perps/perps-candle-dataset.service.spec.ts
[chart]: ../../src/app/popup/perps/perps-chart/perps-chart.component.spec.ts
[channel]: ../../src/app/core/services/perps/perps-data-channel.service.spec.ts
[account]: ../../src/app/core/services/perps/perps-account-state.service.spec.ts
