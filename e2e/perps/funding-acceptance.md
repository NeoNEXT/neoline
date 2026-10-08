# 资金页 7.3 验收映射

依据：[资金页 README 第 7.3 节](../../src/app/popup/perps/perps-funding/README.md#73-可复现验收方案)。浏览器测试使用真实导入、解锁、签名与页面操作，在 HTTP/WS 边界模拟源链、Circle 和 Hyperliquid。模拟回执与余额不能作为真实跨链到账证据。

## 运行

在仓库根目录使用 Node 16.20.1 / npm 8.19.4、Playwright 1.44.1：

```sh
nvm use
npm run e2e:typecheck
npm run e2e -- funding.spec.ts funding-acceptance.spec.ts funding-recovery.spec.ts
npm run e2e -- --grep 'F13'
npm run lint
npm run test:ci -- --progress=false
```

2026-09-30 本地验证：新增 **36 条资金浏览器测试、2 条主网服务测试**。全量浏览器执行 80 条，其中 **76 条正常通过、4 条已知缺口按预期失败**；全量 **1114 条单元测试通过**，lint、E2E TypeScript 检查通过。协议/运行时意外错误为零。Playwright 命令显示 `80 passed`，包含下述预期失败，不能解释为 80 条验收条件全部满足。

定向服务测试：

```sh
npm run test:ci -- --progress=false \
  --include='src/app/popup/perps/perps-funding/*.spec.ts' \
  --include='src/app/core/services/perps/perps-deposit-chain.spec.ts' \
  --include='src/app/core/services/perps/perps-fee-quote.spec.ts' \
  --include='src/app/core/services/perps/perps-rpc.spec.ts' \
  --include='src/app/core/services/perps/perps-exchange-write.service.spec.ts'
```

## 覆盖与边界

| 编号 | 浏览器证据 | 服务/组件证据及未覆盖范围 |
| --- | --- | --- |
| F1 网络与入口 | [基础资金流程][basic]从首页进入两个页签；Arbitrum Sepolia RPC、USDC、扩展合约、测试网 forwarder、Hyperliquid Testnet action 严格配对。钱包壳使用 NeoX 主网，资金链仍按构建配置选择 | [守卫][guard]验证 NeoX 放行、Neo2/Neo3/读取失败重定向；新增[报价][fee]主网 Circle/HyperEVM 路由与[源链][deposit]主网 extension/forwarder 配对。主网生产构建、Neo2/Neo3 的真实浏览器钱包切换未执行 |
| F2 账户模式 | [表单验收][form]覆盖标准、统一、PM、unknown；PM 含另一现货币，标准账户含 HIP-3 保证金和现货 USDC，均不合并；hold 超过 total 时 MAX 为 0。PM MAX 保留六位尾数并发送 `sourceDex: spot` | [组件][component]另验证余额来源缺失。这里只验证本地上限，组合保证金持仓/借款的真实限制属于 F17 |
| F3 精确金额 | [表单验收][form]两方向使用 `10000000000.123457`，最小单位超过 Number 安全整数；25%/50% 向下取六位、7 位输入截断、MAX 尾数保留。解码 EVM 授权与 burn amount，并检查提现 action 的完整十进制金额 | 显示的两位摘要不改签名值；[报价][fee]另验证 bp 产生的小于一最小单位费用向上取整 |
| F4 入金报价 | [基础][basic]与[表单][form]覆盖 bp=1.4、转发费 200000、新账户费 1，开户费不进入 maxFee；缺 Fast 档和不可读费用关闭确认且不广播。费用吞掉全部金额的闸门有 **1 条预期失败** | 未声称验证所有非法数值/实时 getter；负数、超范围参数与长时间确认后的授权过期仍需补验 |
| F5 授权与目标 | [基础][basic]独立恢复 USDC `ReceiveWithAuthorization` 签名，核对域、金额、to、有效期、forwarder mint/caller、本人 hook 与 dex=0；取消重开前无广播，双击只广播一笔。未提供 approve 网络替身，意外请求会失败 | 源链服务使用真实 ABI、授权和原始交易签名；真实合约接受该签名仍待 F14 |
| F6 gas | [表单][form]精确相等可确认、少 1 wei 阻止、ETH 余额读失败不会报作零；发送前 gas estimate 从 100000 增至 200000，签名 gasLimit 从 120000 增至 240000 | **现状边界**：确认显示 0.000360 ETH，实际签名费用上限变成 0.000720 ETH，未重新确认；未知 ETH 也未阻断。正常用例通过不能证明这些边界已满足更强的安全要求 |
| F7 刷新与 MAX | [表单][form]两方向手填不改、刷新失败无写入；入金和[基础提现][basic] MAX 都在余额下降后下调并停止。[恢复][recovery]断线、429、stale 旧账户仍写提现，有 **1 条预期失败** | 对象保留不等于刷新成功；此处单独核对实际账户读取失败与签名写入 |
| F8 报价变动 | [表单][form]入金费上涨重开确认，下降/不变直接发送；各次使用最新 maxFee 与同一授权 nonce/r，开户费未进入授权上限。提现费上涨见[基础][basic]，下降见[表单][form]。[恢复][recovery]延迟旧入金报价、取消后新金额确认，旧结果被忽略 | [组件][component]补切页签、销毁、旧准备失败和取消后的授权清理 |
| F9 广播 | [恢复][recovery]接受后单项网关故障 → 轮换端点 → already known、先网关故障后 nonce 拒绝、整个 HTTP 批次连接重置。各次 raw/hash 相同、只用 nonce=0、只扣一次，后续 receipt 查询原哈希 | 网关故障以 JSON-RPC `network error` 报错；连接重置另用 `route.abort`，两者不混同。新增测试发现并修复 `NotificationService` 缺少未知广播提示的四语言映射；[RPC][rpc]补拒绝/离线分类 |
| F10 后续 | [基础][basic]区分源链 confirmed/reverted，成功不增加 HyperCore 余额；[恢复][recovery]无回执时重载页面，原交易未恢复追踪，也不自动再广播 | [组件][component]和[源链][deposit]验证 `pending` 与等待截止。浏览器重载用例未等待真实 90s 截止，不算源链成功或目标到账；产品没有持久恢复记录 |
| F11 提现 payload | [基础][basic]与[表单][form]检查默认 `''`、统一/PM `spot`，目标本人、CCTP domain=3、data=0x、签名域与 nonce；独立恢复签名者；没有 EVM 目的链交易 | 交易所实际验签与目的链 mint 属于 F14 |
| F12 提现异常 | [恢复][recovery]nonce 拒绝最多重签一次，第二次拒绝停止；余额拒绝不重签。接受后 503/畸形答复保持 unknown、刷新余额、不自动重发；status=0 见[基础][basic]。受控挂起响应期间输入/预设锁定、双击只有一笔 | **现状边界**：unknown 后允许人工再确认，产生新 nonce 并再次扣款；挂起测试证明响应未返回时的控件状态，不声称存在请求截止或永久防重 |
| F13 生命周期 | [恢复][recovery]取消后重开提现确认，旧成功覆盖新报价、旧失败关闭新确认，共 **2 条预期失败**；旧入金准备有序号保护 | 入金切页签/销毁见[组件][component]。准备完成后切钱包、解锁中地址变化、跨窗口串号仍需补验；不能据这些取消用例宣称钱包基线隔离完成 |
| F14 最终到账 | **待真实测试网证据** | 需关联源链回执、目标 mint/转发事件与 HyperCore 账本，余额变化本身不能归因 |
| F15 不足额/回补 | **待真实测试网证据** | 保留现有两倍提现报价下限；用独立测试夹具关联 action、扣款、目的失败与回补。未找到回补证据时保持未确认，不声称已退款 |
| F16 激活费账本 | **待真实测试网证据** | 保存首次资金路径实际 delta.type、金额与费用，按历史页 H14 核对；不把 Circle 新账户费等同于任何交易所激活费 |
| F17 真实可提限制 | **待真实测试网证据** | 标准/统一/PM 的仓位、冻结、借款与风险状态需和真实答复关联；本地 MAX 测试不能证明交易所全部限制 |

## 已知失败的解释

四条 `known gap` 用例用 `test.fail` 保留 README 已明确的未满足条件，测试会真实执行并保存最终截图与协议证据；意外失败按配置额外保留 trace。它们不是跳过项，也不是验收成功。Playwright 会把符合预期的失败计入运行成功数量，判断验收状态必须同时查看用例的 `expectedStatus`、实际结果和本表。

F4 的到账估算为零但 Confirm 可点；F7 的 stale 旧账户在读取失败后仍被接受；F13 的旧提现准备没有代次隔离。修复产品行为时应同步更新这些复现步骤并移除 `test.fail`。本轮只修复缺失的广播通知映射，没有修改这些资金闸门或生命周期规则。

## 运行证据

每条测试保存 `network-summary` 和最终截图：commit、工作区状态、Node、模拟网络、钱包地址、账户模式、原始 info/exchange、资金 RPC、报价 URL、广播字节与错误记录。F9 另在测试内比对 raw/hash 和所有原哈希查询；F11/F12 独立恢复提现签名者。报告在根目录 `test-results/`、`playwright-report/`，不提交。

这些附件含临时测试钱包的签名和 calldata，失败 trace 还可能包含导入的私钥；只允许随机无资金钱包。真实验收记录必须去除私钥、密码和可用授权签名，不能套用模拟附件的原始内容导出方式。

F14–F17 的真实记录至少包含：版本/dirty diff、构建端点、账户地址/模式、合约地址、操作前原始余额/hold/仓位/借款、报价时间/金额/maxFee、公开交易哈希或提现 action/nonce、交易所原始答复、源扣款与费用账本、目的 mint/执行结果、接收金额及后续回补证据。缺少关联证据就保持待验证。本轮未发送真实资金交易或执行生产构建。

[basic]: ./funding.spec.ts
[form]: ./funding-acceptance.spec.ts
[recovery]: ./funding-recovery.spec.ts
[component]: ../../src/app/popup/perps/perps-funding/perps-funding.component.spec.ts
[guard]: ../../src/app/popup/perps/perps-funding/perps-funding.guard.spec.ts
[deposit]: ../../src/app/core/services/perps/perps-deposit-chain.spec.ts
[fee]: ../../src/app/core/services/perps/perps-fee-quote.spec.ts
[rpc]: ../../src/app/core/services/perps/perps-rpc.spec.ts
