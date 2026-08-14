import { PopupApproveDialogComponent } from './approve.dialog';

const ASSET = {
  asset_id: '0x0000000000000000000000000000000000000001',
  symbol: 'FLM',
  decimals: 8,
  balance: '4.77436123',
};

function createComponent() {
  const sentTxs: any[] = [];
  const evmTxService = {
    getNonceInfo: () => Promise.resolve({ nonce: 112, pendingTxs: 0 }),
    // 用授权数量作为编码结果的标记，方便断言 data 是否跟着输入更新。
    getApproveERC20Data: ({ approveAmount }) => `0xdata-${approveAmount}`,
    getTxParams: (txParams) => ({
      newParams: { ...txParams },
      PreExecutionParams: { ...txParams },
    }),
    sendDappTransaction: (_preExecutionParams, newParams) => {
      sentTxs.push(newParams);
      return Promise.resolve({ hash: '0xhash' });
    },
  };
  const component = new PopupApproveDialogComponent(
    {} as any,
    { getPassword: () => Promise.resolve('pwd') } as any,
    evmTxService as any,
    { getPrivateKey: () => Promise.resolve('0xkey') } as any,
    { snackBarTip: () => {} } as any,
    { close: () => {} } as any,
    {
      asset: ASSET,
      encryptWallet: {
        accounts: [
          { address: '0x0000000000000000000000000000000000000002', extra: {} },
        ],
      },
      spender: '0x0000000000000000000000000000000000000003',
      amount: '0.99',
      lang: 'zh_CN',
      rateCurrency: 'USD',
      neoXNetwork: { chainId: 47763, symbol: 'GAS', name: 'Neo X' },
    } as any
  );
  return { component, sentTxs };
}

describe('PopupApproveDialogComponent', () => {
  it('re-encodes the approve data when the max shortcut changes the amount', () => {
    const { component } = createComponent();
    component.ngOnInit();
    expect(component.txParams.data).toBe('0xdata-99000000');

    component.useMaxApproveAmount();

    expect(component.inputAmount).toBe('4.77436123');
    expect(component.txParams.data).toBe('0xdata-477436123');
  });

  it('re-encodes the approve data when the site suggestion is restored', async () => {
    const { component } = createComponent();
    component.ngOnInit();
    // 先让防抖真正落定一个不同的数量，否则断言无法区分 data 有没有被重新编码。
    component.handleInputAmountChange({ target: { value: '2' } });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(component.txParams.data).toBe('0xdata-200000000');

    component.useDappApproveAmount();

    expect(component.txParams.data).toBe('0xdata-99000000');
  });

  it('sends the typed amount even when confirming before the input debounce fires', async () => {
    const { component, sentTxs } = createComponent();
    component.ngOnInit();
    await Promise.resolve();

    component.handleInputAmountChange({ target: { value: '1.5' } });
    await component.confirm();

    expect(sentTxs.length).toBe(1);
    expect(sentTxs[0].data).toBe('0xdata-150000000');
  });

  it('drops the stale data and refuses to confirm once the input is cleared', async () => {
    const { component, sentTxs } = createComponent();
    component.ngOnInit();
    await Promise.resolve();

    component.handleInputAmountChange({ target: { value: '' } });
    await component.confirm();

    expect(component.txParams).toBeUndefined();
    expect(sentTxs.length).toBe(0);
  });
});
