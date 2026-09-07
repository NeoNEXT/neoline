import { ethers } from 'ethers';
import { PERPS_DEPOSIT_CONFIG, PerpsLedgerUpdate } from '@popup/_lib/perps';
import { cctpCollectedFee } from './perps-cctp-history';

const config = PERPS_DEPOSIT_CONFIG.testnet;
const user = '0x5be1a4c623a63498d78c08b8890a6e5dad6bf359';
const hash = '0x70a33d1d5b36bc89fedb44e729daaf42773b48957521db4512927b5090b087cc';
const update = { delta: { user, amount: '1.123456' } } as PerpsLedgerUpdate;
const abi = new ethers.Interface([
  'event MintAndWithdraw(address indexed mintRecipient, uint256 amount, address indexed mintToken, uint256 feeCollected)',
]);
const receipt = (fee = 200000, recipient = user) => ({
  status: '0x1', transactionHash: hash,
  logs: [{
    address: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
    ...abi.encodeEventLog(abi.getEvent('MintAndWithdraw'), [
      recipient, 1123456 - fee, config.cctp.usdc, fee,
    ]),
  }],
});

describe('CCTP 历史实收费用', () => {
  it('读取事件实际收费，费率变化与零收费均不套常量', () => {
    expect(cctpCollectedFee(receipt(), hash, update, config)).toBe('0.2');
    expect(cctpCollectedFee(receipt(370000), hash, update, config)).toBe('0.37');
    expect(cctpCollectedFee(receipt(0), hash, update, config)).toBe('0');
  });
  it('失败、缺失、交易不匹配时不编造费用', () => {
    expect(cctpCollectedFee(null, hash, update, config)).toBeUndefined();
    expect(cctpCollectedFee({ ...receipt(), status: '0x0' }, hash, update, config)).toBeUndefined();
    expect(cctpCollectedFee(receipt(), '0xwrong', update, config)).toBeUndefined();
  });
  it('接收方、代币、发行合约与金额都必须匹配', () => {
    expect(cctpCollectedFee(receipt(200000, ethers.ZeroAddress), hash, update, config)).toBeUndefined();
    const wrongContract = receipt();
    wrongContract.logs[0].address = ethers.ZeroAddress;
    expect(cctpCollectedFee(wrongContract, hash, update, config)).toBeUndefined();
    expect(cctpCollectedFee(receipt(), hash, {
      delta: { user, amount: '2' },
    } as PerpsLedgerUpdate, config)).toBeUndefined();
    expect(cctpCollectedFee(receipt(), hash, update, {
      ...config, cctp: { ...config.cctp, usdc: ethers.ZeroAddress },
    })).toBeUndefined();
  });
  it('多个可匹配事件不任意选择或重复计费', () => {
    const ambiguous = receipt();
    ambiguous.logs.push(ambiguous.logs[0]);
    expect(cctpCollectedFee(ambiguous, hash, update, config)).toBeUndefined();
  });
});
