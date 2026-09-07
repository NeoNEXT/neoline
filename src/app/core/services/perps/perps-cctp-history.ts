import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { PerpsDepositConfig, PerpsLedgerUpdate } from '@popup/_lib/perps';

const MINT_EVENT = new ethers.Interface([
  'event MintAndWithdraw(address indexed mintRecipient, uint256 amount, address indexed mintToken, uint256 feeCollected)',
]);

/** Circle CCTP V2 TokenMessenger，主网与测试网部署地址。 */
const TOKEN_MESSENGER = {
  42161: '0x28b5a0e9c621a5badaa536219b3a228c8168cf5d',
  421614: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
};

/** 仅接受可与该账本金额匹配的唯一成功 mint；不读当前费率，也不猜历史费率。 */
export function cctpCollectedFee(
  receipt: any,
  hash: string,
  update: PerpsLedgerUpdate,
  config: PerpsDepositConfig
): string | undefined {
  if (receipt?.status !== '0x1' ||
      receipt.transactionHash?.toLowerCase() !== hash.toLowerCase() ||
      !Array.isArray(receipt.logs)) {
    return undefined;
  }
  const matches: string[] = [];
  for (const log of receipt.logs) {
    if (log.removed || log.address?.toLowerCase() !== TOKEN_MESSENGER[config.chainId]) {
      continue;
    }
    try {
      const event = MINT_EVENT.parseLog(log);
      if (!event ||
          event.args.mintToken.toLowerCase() !== config.cctp.usdc.toLowerCase() ||
          event.args.mintRecipient.toLowerCase() !== update.delta.user?.toLowerCase()) {
        continue;
      }
      const amount = new BigNumber(event.args.amount.toString()).shiftedBy(-6);
      const fee = new BigNumber(event.args.feeCollected.toString()).shiftedBy(-6);
      if (amount.plus(fee).eq(update.delta.amount)) {
        matches.push(fee.toFixed());
      }
    } catch {
      // 其他事件或损坏的日志不能成为费用依据。
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}
