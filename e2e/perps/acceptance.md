# 下单页 7.3 验收映射

依据：[下单页 README 第 7.3 节](../../src/app/popup/perps/perps-order/README.md#73-可复现验收方案)。
这里区分浏览器端到端、组件/模型自动化与真实测试网证据。网络替身通过测试，不能证明交易所会接受同一请求。

## 运行

在仓库根目录，使用 `.nvmrc` 的 Node 16.20.1 和 Playwright 1.44.1：

```sh
nvm use
npm run e2e:typecheck
npm run e2e
npm run lint
npm run test:ci -- --progress=false
```

2026-09-30 本地验证：Node 16.20.1、Playwright 1.44.1，**44 条浏览器测试、1112 条单元测试通过**；lint、E2E TypeScript 检查通过。本轮新增 27 条浏览器用例和 10 条单元测试；未执行真实交易或生产构建。

只跑新增浏览器验收：

```sh
npm run e2e -- order-acceptance.spec.ts order-recovery.spec.ts
npm run e2e -- --grep 'O17'
```

定向运行依赖的组件/模型测试：

```sh
npm run test:ci -- --progress=false \
  --include='src/app/popup/perps/perps-order/*.spec.ts' \
  --include='src/app/core/services/perps/perps-trade-order.service.spec.ts' \
  --include='src/app/core/services/perps/perps-exchange-write.service.spec.ts' \
  --include='src/app/core/services/perps/perps-data-channel.service.spec.ts' \
  --include='src/app/popup/_lib/perps-margin.spec.ts' \
  --include='src/app/core/services/perps/hyperliquid.service.spec.ts'
```

## 覆盖与限制

| 编号 | 浏览器证据 | 组件/模型证据与边界 |
| --- | --- | --- |
| O1 | [表单验收](order-acceptance.spec.ts)：普通方向切换、cross 路由、详情进入加仓/平仓、100% 默认值；HIP-3 完整 coin 与 assetId | [渲染测试][render]验证无确认面板、限价和模式切换控件；浏览器只使用当前存在的入口 |
| O2 | [表单验收](order-acceptance.spec.ts)：P=30、M=31、精度 2、杠杆 5；显示 $20.65，最终签名发送 3.33，账户展示 3.33 | [组合测试][composition]断言 Q=3.33、N=99.9、内部保证金 20.646 |
| O3 | [表单验收](order-acceptance.spec.ts)：不同方向容量、100% 向下取分、零容量、模式不匹配、容量缺失不回退到余额 | [组合测试][composition]覆盖数量精度、不同账户模式、容量模式/杠杆匹配；此处不能证明外部容量单位，见 O15 |
| O4 | [表单验收](order-acceptance.spec.ts)：空仓 2 分别买入 1 和 3，只发送 1/3；账户最终分别为空 1、多 1 | [组合测试][composition]覆盖反向净仓预估，区别于 O14 |
| O5 | [表单验收](order-acceptance.spec.ts)：2.0001 的 50% 平仓，再将最新仓位改为 1.2345 后全平；reduceOnly、精确数量、无容量仍可退出 | [交易服务测试][trade]验证刷新后仓位消失/反转/不可用时不发单；实际交易所尾数处理见 O16 |
| O6 | [响应丢失测试](perps.spec.ts)双击只发送一次 | [组件测试][component]使用延迟私钥 Promise，覆盖超滑点、固定数量容量不足、assetId/数量精度变化、钱包切换；滑点内保留点击时数量和基准价格；[渲染测试][render]验证控件锁定和重复点击 |
| O7 | [表单验收](order-acceptance.spec.ts)：独立杠杆成功、业务拒绝、已生效但响应丢失；只出现 updateLeverage；返回详情重新读取真实替身状态 | 网络未知时不能把页面恢复旧杠杆视为场所回滚；[组件测试][component]另覆盖全仓模式、并发锁 |
| O8 | 不通过界面构造不存在的强平档位控件 | [保证金测试][margin]独立核对权益=维持保证金、多空单档/跨档与边界；[组合测试][composition]覆盖加仓、反向抵减、净零/缺数据 N/A、全仓固定数量与杠杆无关 |
| O9 | [表单验收](order-acceptance.spec.ts)：推荐折扣、HIP-3 d<1/d>=1/growth/缺系数、只显示费率，无 builder 授权 | [组合测试][composition]、[组件测试][component]验证负 maker 费率及返佣符号；[写服务测试][exchange]覆盖 builder 模式/权益门槛、读取失败及授权缓存后的资格重查。当前 builder 地址为空，UI 无 maker 限价入口 |
| O10 | [复杂订单](complex-orders.spec.ts)多空合法/反侧触发价、仅 TP；[表单验收](order-acceptance.spec.ts)开关开启但两项空、不生成子单，%/$ 联动 | [渲染测试][render]验证解锁中价格穿过触发价后再次拦截及多空联动公式 |
| O11 | [复杂订单](complex-orders.spec.ts)filled + error；[恢复验收](order-recovery.spec.ts)partial + waitingForFill；账户保留父单影响，提示保护未确认，无补单 | [写服务测试][exchange]验证 filled + waitingForFill 提示未确认、filled + waitingForTrigger 不误报，以及 partial 始终提示未确认；网络替身只声明协议响应，不调用应用业务计算 |
| O12 | [恢复验收](order-recovery.spec.ts)：先成交再丢响应/503/畸形响应，原 cloid 查回，刷新持仓；[响应丢失测试](perps.spec.ts)：四次无结果，再查四次仍沿用 cloid，保持禁用 | 不自动重发；查询得到订单也不自动导航或冒充完整成交确认 |
| O13 | [恢复验收](order-recovery.spec.ts)：停止 pong，走真实 30s ping + 10s 超时，旧报价/stale、重连与恢复订阅；离开后已提交写入可完成，旧回调不导航 | [组件测试][component]与[生命周期测试][lifecycle]验证地址切换、销毁停止未知查询和忽略过期回调。按当前规则，stale 本身不禁用 HTTP 下单 |
| O14 | 当前 UI 无限价/GTC/显式 reverse 控件，不编造入口 | [交易服务测试][trade]验证限价规范化、GTC、reduceOnly、显式 reverse 使用刷新旧仓+目标数量；属于模型保留分支 |
| O15 | **待真实测试网验收** | 本地替身只能验证“假设容量单位正确时”的行为，不能证明索引和杠杆缩放的交易所口径 |
| O16 | **待真实测试网验收** | [组合测试][composition]覆盖小额 IOC/GTC 全平豁免、部分平仓预检阻断，不能证明交易所接受条件；GTC 只在模型夹具验证 |
| O17 | [基础下单](perps.spec.ts)和[恢复验收](order-recovery.spec.ts)：一次点击，updateLeverage → 新容量 → order；阻塞容量响应时无订单；缺失/错误模式/旧杠杆/不足容量拦截；[复杂订单](complex-orders.spec.ts)补零容量 | [交易服务测试][trade]验证等待设置成功后才开始读取容量；O5 验证退出不依赖此链路 |

## 每次运行的证据

Playwright 报告里的 `network-summary` 附件保存 commit、工作区状态、Node、模拟网络、随机地址、市场精度/元数据、账户模式、带时间的原始 info/exchange 请求及响应。订单包含 cloid，逐单结果包含 oid；账户快照及最终替身仓位/杠杆一并记录。

每条测试保存 `final-page` 截图。O2 另保存计算输入、期望值和表单截图，内部计算结果由组合测试断言。失败额外保留 trace 和失败截图。报告目录 `playwright-report/`、`test-results/` 不提交；当前 CI 仍只在失败时上传报告，成功运行的完整证据可在本地报告查看。

`orderFailure` 的替身先更新场所仓位，再在客户端制造故障；附件中的 exchange response 是**替身场所生成的答复**，故障测试里客户端可能收到 503、畸形体或根本收不到答复，不能将它解释为客户端成功回执。不存在自动补发或自动增加保护单的替身逻辑。

测试钱包为随机无资金地址。浏览器真实执行导入/解锁、业务计算和签名，签名者由替身独立恢复；所有外部 HTTP/WS 被显式模拟，意外请求会令测试失败。日志中没有导出私钥，trace 仍可能包含输入过的临时测试私钥。

## O15、O16 的真实验收记录

这两项未接入默认 CI；当前会话没有真实测试账户和成交证据。后续在独立测试网环境执行时，每一组操作保存下列记录，不把本地阻断写成交易所拒绝：

| 记录 | 内容 |
| --- | --- |
| 环境 | commit、dirty diff、Node、构建网络、地址、账户模式 |
| 市场 | coin/key/assetId、数量精度、mid/mark、保证金档位 |
| 操作前 | 原始 activeAssetData 两侧值、模式/杠杆、原始账户仓位和余额、输入金额/数量 |
| 操作 | 时间、完整 action、nonce、cloid；禁止记录私钥/密码 |
| 答复 | HTTP 状态、原始逐项 statuses、oid；本地阻断时记录阻断原因且标注“没有 exchange 请求” |
| 操作后 | 刷新账户、仓位/成交记录、截图 |

O15：同市场分别记录买/卖方向，改变杠杆后重新取容量，将签名发送数量及答复与两侧字段比较，不能由假数据缩放推导交易所规则。

O16：IOC/GTC × 全平/部分平仓，四组均使用名义额低于 10 USD 的仓位；全平保留全部尾数。GTC 由模型夹具执行，不描述成现有 UI 步骤。若部分平仓在本地被拦截，记录这一事实，不能将其计作交易所拒绝或绕过预检后宣称 UI 通过。

[component]: ../../src/app/popup/perps/perps-order/perps-order.component.spec.ts
[render]: ../../src/app/popup/perps/perps-order/perps-order.component.render.spec.ts
[composition]: ../../src/app/popup/perps/perps-order/perps-order-composition.spec.ts
[lifecycle]: ../../src/app/popup/perps/perps-order/perps-order-lifecycle.spec.ts
[trade]: ../../src/app/core/services/perps/perps-trade-order.service.spec.ts
[exchange]: ../../src/app/core/services/perps/perps-exchange-write.service.spec.ts
[margin]: ../../src/app/popup/_lib/perps-margin.spec.ts
