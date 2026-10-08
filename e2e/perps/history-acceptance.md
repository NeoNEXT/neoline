# Perps 历史页 7.3 验收映射

依据：[历史页 README 第 7.3 节](../../src/app/popup/perps/perps-history/README.md#73-可复现验收方案真实链路验收未执行)。浏览器测试用真实页面、随机测试钱包和模拟 HTTP/WS 边界；它们验证本地集成行为，不证明真实交易所答复、跨链结果或真实账户隔离。

## 运行

```sh
nvm use
npm run e2e:typecheck
npm run e2e -- history-acceptance.spec.ts
npm run lint
npm run test:ci -- --progress=false \
  --include='src/app/popup/perps/perps-history/*.spec.ts' \
  --include='src/app/core/services/perps/hyperliquid.service.spec.ts' \
  --include='src/app/core/services/perps/perps-exchange-write.service.spec.ts' \
  --include='src/app/core/services/perps/perps-cctp-history.spec.ts' \
  --include='src/app/core/services/perps/perps-data-channel.service.spec.ts' \
  --include='src/app/core/services/perps/perps-market-dataset.service.spec.ts' \
  --include='src/app/popup/perps/perps.util.spec.ts' \
  --reporters=dots
```

## 覆盖与边界

| 编号 | 自动化证据 | 未覆盖范围 |
| --- | --- | --- |
| H1 | [浏览器验收](history-acceptance.spec.ts)：进入历史页、读取两个启用 DEX 的挂单；WS 成交快照先到时不发 REST；历史委托、资金费和转账按需各请求一次，切回不重复；未知状态与原始数量可见。组件测试另覆盖成交 REST 兜底和归档缓存 | 没有声称存在价格/筛选/详情入口；真实账户数据未执行 |
| H2 | [读取服务测试][hyperliquid]与[组件测试][component]：启用 DEX、完整 coin、现货过滤和市场缺失时保留挂单 | 浏览器未构造单个 DEX 失败；不证明真实多 DEX 接口可用性 |
| H3 | [浏览器验收](history-acceptance.spec.ts)：三类归档各有 201 条输入时页面最多渲染 200 条。[组件测试][component]覆盖同时间稳定顺序、三类归档上限与成交 201 条不截断；[管道测试][pipes]覆盖本地日期、跨午夜和跨年 | 空闲跨午夜不更新直到事件触发，未做长时间浏览器等待 |
| H4 | [组件测试][component]覆盖 REST/WS 竞争、快照替换、重复、增量合并和迟到 REST 错误 | 不证明不同真实 WS 快照的服务端时间窗口 |
| H5–H6 | [渲染测试][render]、[管道测试][pipes]覆盖数量精度、状态文本、隐藏价格、净额、builder fee、非 USDC、内部转账、资金费精度 | 浏览器不模拟每一种畸形场所记录 |
| H7–H8 | [渲染测试][render]覆盖双击确认、提交中禁用；[写服务测试][exchange]覆盖 asset/oid 与 uint64；组件测试覆盖撤单错误与前置条件 | 真实签名、硬件钱包、逐项交易所答复及撤单后的 WS/历史核对待测试网执行 |
| H9–H10 | 组件/写服务测试覆盖已知响应分支和本地缓存行为；README 7.4 明确指出缺少 statuses 可能误报成功、在途历史响应可能覆盖撤单后的失效标记 | 这些边界不是通过项；未知响应后的真实 oid 查询与外部新增账本刷新待人工核验 |
| H11 | [通道测试][channel]覆盖心跳、断线重连、订阅恢复；组件测试覆盖归档失败后重试 | 历史页浏览器断网/半开恢复、无限等待尚未执行；页面没有 stale 横幅 |
| H12 | [CCTP 关联测试][cctp]及[事件测试][cctpHistory]覆盖 nonce/事件匹配、失败回退和费用精度 | 没有目的链真实到账证据，页面也不声称已到账 |
| H13–H14 | README 7.3 保留真实钱包切换与激活费账本采集步骤 | 地址隔离存在已知缺口；未采集实际激活费账本样本，均不视为通过 |

## 本次运行结果

Node `16.20.1`、npm `8.19.4`、Playwright `1.44.1`。历史页新增的 **2 条浏览器测试通过**，E2E TypeScript 检查、lint 通过；上表定向单测 **241 项通过**。真实撤单、测试网资金操作和跨链到账未执行。

[component]: ../../src/app/popup/perps/perps-history/perps-history.component.spec.ts
[render]: ../../src/app/popup/perps/perps-history/perps-history.component.render.spec.ts
[pipes]: ../../src/app/popup/perps/perps-history/perps-history.pipe.spec.ts
[hyperliquid]: ../../src/app/core/services/perps/hyperliquid.service.spec.ts
[exchange]: ../../src/app/core/services/perps/perps-exchange-write.service.spec.ts
[channel]: ../../src/app/core/services/perps/perps-data-channel.service.spec.ts
[cctp]: ../../src/app/core/services/perps/hyperliquid.service.spec.ts
[cctpHistory]: ../../src/app/core/services/perps/perps-cctp-history.spec.ts
