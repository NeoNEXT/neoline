# Perps 首页 7.3 验收映射

依据：[Perps 首页 README 第 7.3 节](../../src/app/popup/perps/perps-tab/README.md#73-可复现验收步骤真实网络验收未执行)。浏览器测试使用真实页面和随机测试钱包，在 HTTP/WS 边界使用替身；不能据此声称真实账户、链上资金或交易所行为已经通过。

## 运行

```sh
nvm use
npm run e2e:typecheck
npm run e2e -- tab-acceptance.spec.ts
npm run lint
npm run test:ci -- --progress=false \
  --include='src/app/popup/perps/perps-tab/*.spec.ts' \
  --include='src/app/popup/perps/perps-market-list/*.spec.ts' \
  --include='src/app/core/services/perps/perps-account-state*.spec.ts' \
  --include='src/app/core/services/perps/perps-market-dataset*.spec.ts' \
  --include='src/app/core/services/perps/perps-dataset.spec.ts' \
  --include='src/app/core/services/perps/perps-data-channel.service.spec.ts'
```

## 覆盖与边界

| 编号 | 自动化证据 | 未覆盖范围 |
| --- | --- | --- |
| A1 | [基础 Perps E2E][perps]覆盖进入首页、行情行和详情导航；[首页验收 E2E][tabE2e]使用真实路由及页面检查 | Neo2/Neo3 真实钱包切换和完整导航往返仍待验证 |
| A2–A3 | [首页验收 E2E][tabE2e]覆盖统一账户 USDC `total/hold`；[账户测试][account]覆盖标准账户、统一/组合模式、未知值与多 DEX 聚合 | 组合保证金抵押品、借款和完整可提额度未由 USDC 展示测试证明 |
| A4 | [首页验收 E2E][tabE2e]让 xyz clearinghouse 请求返回 503，核对不完整提示、资金入口禁用和已知仓位保留；账户服务测试覆盖失败重试与部分读取 | 真实端点权限、长时间挂起及恢复时序未执行 |
| A5 | [Tab 渲染测试][tabRender]覆盖价格、格式、收益率、强平价与 stale UI | 没有真实市场行情和账户响应证据 |
| A6 | [市场列表测试][marketList]覆盖排序、分页及价格帧不重排 | 浏览器尚未跑超过 30 行后的行情排序注入 |
| A7–A8 | [数据通道测试][channel]与[数据集测试][dataset]覆盖心跳、重连、共享请求、快照/帧仲裁和补读 | 真实断网恢复与服务端帧时序尚未执行 |
| A9 | 账户服务测试及[订单生命周期测试][order]覆盖订阅隔离/请求生命周期的局部行为 | 浏览器跨地址切换及 NeoX→Neo2/Neo3 的完整步骤尚未执行 |
| A10 | [下单验收映射][orderMap]及[基础下单 E2E][perps]覆盖 filled、resting、拒绝和响应不确定等下游流程 | 真实交易所成交与余额更新未执行 |
| A11 | [资金验收映射][funding]覆盖余额刷新、回执和未知结果 | 真实源链确认、HyperCore 入账和到账归因未执行 |

## 本次运行结果

Node `16.20.1`、npm `8.19.4`、Playwright `1.44.1`。本文件新增的 **2 条浏览器测试通过**，E2E TypeScript 检查、lint 通过；README 定向单测 **136 项通过**。真实钱包切换、断线联调、交易和资金到账未执行。

[tabE2e]: ./tab-acceptance.spec.ts
[perps]: ./perps.spec.ts
[orderMap]: ./acceptance.md
[funding]: ./funding-acceptance.md
[account]: ../../src/app/core/services/perps/perps-account-state.service.spec.ts
[tabRender]: ../../src/app/popup/perps/perps-tab/perps-tab.component.render.spec.ts
[marketList]: ../../src/app/popup/perps/perps-market-list/perps-market-list.component.spec.ts
[channel]: ../../src/app/core/services/perps/perps-data-channel.service.spec.ts
[dataset]: ../../src/app/core/services/perps/perps-dataset.spec.ts
[order]: ../../src/app/popup/perps/perps-order/perps-order-lifecycle.spec.ts
