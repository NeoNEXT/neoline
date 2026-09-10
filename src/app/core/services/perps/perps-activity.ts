/** Info 与 WebSocket 共用的现货 coin 格式；其余保留为永续（含 HIP-3）。 */
export function isPerpsActivity(row: { coin?: string }): boolean {
  // 协议 JSON 的容错标准见 `normalizeIds`：形状不对的行原样放行，而不是抛错。
  // 这两条链路都跑在数据通道的 `map` 里，而那里的订阅方没有 error 分支 ——
  // 一次抛错会让实时订阅永久停摆，且页面说不出它停了。
  const coin = row?.coin;
  return (
    typeof coin !== 'string' || (coin !== 'PURR/USDC' && !/^@\d+$/.test(coin))
  );
}
