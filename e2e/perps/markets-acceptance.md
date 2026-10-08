# Perps 市场页 7.3 验收映射

依据：[市场页 README 第 7.3 节](../../src/app/popup/perps/perps-markets/README.md#73-可复现验收方案自动化部分执行真实行情未执行)。浏览器测试通过真实 Angular 页面与路由交互，在 HTTP/WS 边界使用固定替身；结果证明本地页面集成行为，不证明真实 Hyperliquid 数据或行情时序。

## 运行

```sh
nvm use
npm run e2e:typecheck
npm run e2e -- markets-acceptance.spec.ts
npm run lint
npm run test:ci -- \
  --include='src/app/popup/perps/perps-market-list/*.spec.ts' \
  --include='src/app/core/services/perps/perps-market-dataset.service.spec.ts' \
  --include='src/app/core/services/perps/perps-dataset.spec.ts' \
  --include='src/app/core/services/perps/perps-data-channel.service.spec.ts' \
  --include='src/app/core/services/perps/hyperliquid.service.spec.ts' \
  --include='src/app/popup/perps/perps.util.spec.ts' \
  --reporters=dots
```

## 覆盖与边界

| 编号 | 自动化证据 | 未覆盖范围 |
| --- | --- | --- |
| S1–S2 | [浏览器验收][marketsE2e]覆盖从首页进入 markets、搜索框自动聚焦、大小写/空格/部分词本地过滤、清空与首批重置 | 离页再进入后的排序/状态重置、Neo2/Neo3 入口限制未在本组浏览器测试执行 |
| S3 | [列表组件测试][list]覆盖 NEO/GAS 置顶和排序；浏览器 HIP-3 用例覆盖同名资产能分别导航 | 行上没有 DEX 标记仍是产品可见性边界；没有声称用户能仅凭相同 symbol 区分来源 |
| S4–S5、S9 | [浏览器验收][marketsE2e]覆盖真实模板上的 mid 价格、涨幅、成交额 `$1.23M`、mark 退化价标签、WS 数值更新时冻结行序、重选成交额排序后重排及无有效价格显示 N/A；[列表组件测试][list]覆盖精确值降序及更多数值边界 | 缺失成交额的排序边界、实盘价格口径未验证 |
| S6–S8 | [浏览器验收][marketsE2e]覆盖本地搜索无额外请求、两项置顶加 65 个普通市场的 32→62→67 分批展示；[列表组件测试][list]覆盖筛选中行情帧与集合变化时的行序/分页行为 | 超过 30 行时的实时行情和动态集合变化尚未注入浏览器 |
| S10 | [浏览器验收][marketsE2e]覆盖同名标准/xyz 行选择后保留 `xyz:TSLA` 路由并读取对应 DEX；[市场数据集测试][market]覆盖按 DEX 名与原 universe 下标套用聚合帧 | 没有验证真实服务端聚合帧顺序与全量 HIP-3 市场 |
| S11 | [浏览器验收][marketsE2e]覆盖 xyz 元数据请求失败后仍显示不完整提示，搜索无匹配时不展示确定的空列表结论；[市场数据集测试][market]覆盖注册表失败、部分 DEX 失败和重试 | 注册表失败、标准 DEX 失败、真实请求挂起未在本组浏览器测试执行 |
| S12–S14 | [数据集][dataset]、[通道][channel]、[市场数据集][market]单测覆盖 TTL、退避、快照/帧竞态、共享请求、重连和回收 | 浏览器级长时间等待、真实断线与行情恢复尚未执行 |
| S15 | [浏览器验收][marketsE2e]用真实市场行点击验证导航；上述列表单测覆盖选择事件 | Logo 失败样式、菜单外关闭和实盘 coin/prevDayPx 对照未由本组通过证明 |

## 本次运行结果

Node `16.20.1`、npm `8.19.4`、Playwright `1.44.1`。新增 **4 条 markets 浏览器测试通过**，E2E TypeScript 检查通过；对应列表/市场数据集/共享数据集/通道/读取服务/格式化测试 **177 项通过**，`npm run lint` 通过。真实行情、真实 DEX 端点与 Neo2/Neo3 钱包切换未执行。

[marketsE2e]: ./markets-acceptance.spec.ts
[list]: ../../src/app/popup/perps/perps-market-list/perps-market-list.component.spec.ts
[market]: ../../src/app/core/services/perps/perps-market-dataset.service.spec.ts
[dataset]: ../../src/app/core/services/perps/perps-dataset.spec.ts
[channel]: ../../src/app/core/services/perps/perps-data-channel.service.spec.ts
