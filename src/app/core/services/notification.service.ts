import { Injectable } from '@angular/core';
import { SettingState } from '../states/setting.state';

@Injectable()
export class NotificationService {
  public content: any;
  private EN = {
    close: 'Close',
    hiddenSucc: 'Hidden success!',
    clearSuccess: 'Clear success!',
    addSucc: 'Add success!',
    loginSucc: 'Login success!',
    balanceLack: 'Not enough balance',
    checkAddress: 'Please check your address',
    wentWrong: 'Something went wrong',
    verifyFailed: 'Verify Failed',
    langSetSucc: 'language switched!',
    checkInput: 'Please check your input',
    signFailed: 'Signature failed',
    transferFailed: 'Transfer failed',
    nameModifySucc: 'Name modify success!',
    nameModifyFailed: 'Name modify failed',
    walletCreateSucc: 'Wallet creation success!',
    walletCreateFailed: 'Wallet creation failed',
    walletImportFailed: 'Wallet import failed or wallet already exists',
    existingWallet: 'Wallet already exists',
    wrongAddress: 'Please enter a legal address',
    rejected: 'Rejected',
    rateCurrencySetSucc: 'Asset conversion target revised successfully!',
    nep6Wrong: 'Choose the correct file',
    agreePrivacyPolicy: 'Please agree to the privacy agreement',
    insufficientBalance: 'Insufficient GAS to pay for fees! Required',
    butOnlyHad: 'but only had',
    insufficientSystemFee: 'Insufficient balance when gas fee added',
    rpcError: 'rpc error, please check the console.',
    InsufficientNetworkFee: 'Insufficient network fee',
    InsufficientGas: 'Insufficient GAS to pay for fees',
    Invalid_RPC_URL: 'Invalid RPC URL',
    TransactionDeniedByUser: 'Transaction denied by user.',
    LedgerUnSupportSignError: `error: 'There was an error signing this transaction. Ledger does not support this method.`,
    switchSucc: 'switch successfully!',
    PleaseEnterWalletName: 'Please enter wallet name',
    AddressAdded: 'Address added',
    switchOnePasswordFirst:
      'Please switch to the new password management mode first.',
    copied: 'Copied!',
  };
  private CN = {
    close: '关闭',
    hiddenSucc: '隐藏成功!',
    clearSuccess: '清除成功',
    addSucc: '添加成功!',
    loginSucc: '登录成功!',
    balanceLack: '余额不足',
    checkAddress: '请检查您的地址',
    wentWrong: '出了点小问题',
    verifyFailed: '验证失败',
    langSetSucc: '已切换语言!',
    checkInput: '请检查您的输入',
    signFailed: '签名失败',
    transferFailed: '转账失败',
    nameModifySucc: '名称修改成功',
    nameModifyFailed: '名称修改失败',
    walletCreateFailed: '钱包创建失败',
    walletCreateSucc: '钱包创建成功',
    walletImportFailed: '钱包导入失败或钱包已经存在',
    existingWallet: '钱包已经存在',
    wrongAddress: '请输入合法地址',
    rejected: '已拒绝',
    rateCurrencySetSucc: '资产兑换目标修改成功',
    nep6Wrong: '请选择正确的文件',
    agreePrivacyPolicy: '请同意隐私协议',
    insufficientBalance: 'GAS 不足以支付费用！需要',
    butOnlyHad: '但只有',
    insufficientSystemFee: '加上燃料费后余额不足',
    rpcError: '节点返回错误, 请查看控制台。',
    InsufficientNetworkFee: '网络费不足',
    InsufficientGas: 'GAS 不足以支付费用',
    Invalid_RPC_URL: '无效的 RPC URL',
    TransactionDeniedByUser: '交易被用户拒绝。',
    LedgerUnSupportSignError: '签名此交易时出错。硬件不支持该方法。',
    switchSucc: '切换成功！',
    PleaseEnterWalletName: '请输入钱包名',
    AddressAdded: '添加成功',
    switchOnePasswordFirst: '请先切换到新的密码管理模式',
    copied: '已复制！',
  };
  constructor(private settingState: SettingState) {
    this.content = this.EN;
    this.settingState.langSub.subscribe((res) => {
      this.content = res === 'zh_CN' ? this.CN : this.EN;
    });
  }
}
