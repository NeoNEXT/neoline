import { Injectable } from '@angular/core';
import { SettingState } from '../states/setting.state';

interface NotificationContent {
  close: string;
  hiddenSucc: string;
  clearSuccess: string;
  addSucc: string;
  balanceLack: string;
  wentWrong: string;
  verifyFailed: string;
  checkInput: string;
  txFailed: string;
  nameModifySucc: string;
  networkModifySucc: string;
  walletCreateFailed: string;
  walletImportFailed: string;
  existingWallet: string;
  wrongAddress: string;
  nep6Wrong: string;
  insufficientBalance: string;
  butOnlyHad: string;
  insufficientSystemFee: string;
  rpcError: string;
  InsufficientNetworkFee: string;
  InsufficientGas: string;
  TransactionDeniedByUser: string;
  LedgerUnSupportSignError: string;
  switchSucc: string;
  PleaseEnterWalletName: string;
  AddressAdded: string;
  switchOnePasswordFirst: string;
  copied: string;
  exceedDepositLimit: string;
  exceedWithdrawalLimit: string;
}

@Injectable()
export class NotificationService {
  public content: any;
  private EN: NotificationContent = {
    close: 'Close',
    hiddenSucc: 'Hidden success!',
    clearSuccess: 'Clear success!',
    addSucc: 'Add success!',
    balanceLack: 'Not enough balance',
    wentWrong: 'Something went wrong',
    verifyFailed: 'Verify Failed',
    checkInput: 'Please check your input',
    txFailed: 'Transaction failed',
    nameModifySucc: 'Name modify success!',
    networkModifySucc: 'Network modify success!',
    walletCreateFailed: 'Wallet creation failed',
    walletImportFailed: 'Wallet import failed or wallet already exists',
    existingWallet: 'Wallet already exists',
    wrongAddress: 'Please enter a legal address',
    nep6Wrong: 'Choose the correct file',
    insufficientBalance: 'Insufficient GAS to pay for fees! Required',
    butOnlyHad: 'but only had',
    insufficientSystemFee: 'Insufficient balance when gas fee added',
    rpcError: 'RPC error',
    InsufficientNetworkFee: 'Insufficient network fee',
    InsufficientGas: 'Insufficient GAS to pay for fees',
    TransactionDeniedByUser: 'Transaction denied by user.',
    LedgerUnSupportSignError: `error: 'There was an error signing this transaction. Ledger does not support this method.`,
    switchSucc: 'switch successfully!',
    PleaseEnterWalletName: 'Please enter wallet name',
    AddressAdded: 'Address added',
    switchOnePasswordFirst:
      'Please switch to the new password management mode first.',
    copied: 'Copied!',
    exceedDepositLimit: 'Exceeding the maximum deposit limit',
    exceedWithdrawalLimit: 'Exceeding the maximum withdrawal limit',
  };
  private CN: NotificationContent = {
    close: '关闭',
    hiddenSucc: '隐藏成功!',
    clearSuccess: '清除成功',
    addSucc: '添加成功!',
    balanceLack: '余额不足',
    wentWrong: '出了点小问题',
    verifyFailed: '验证失败',
    checkInput: '请检查您的输入',
    txFailed: '交易失败',
    nameModifySucc: '名称修改成功',
    networkModifySucc: '网络修改成功！',
    walletCreateFailed: '钱包创建失败',
    walletImportFailed: '钱包导入失败或钱包已经存在',
    existingWallet: '钱包已经存在',
    wrongAddress: '请输入合法地址',
    nep6Wrong: '请选择正确的文件',
    insufficientBalance: 'GAS 不足以支付费用！需要',
    butOnlyHad: '但只有',
    insufficientSystemFee: '加上燃料费后余额不足',
    rpcError: '节点返回错误',
    InsufficientNetworkFee: '网络费不足',
    InsufficientGas: 'GAS 不足以支付费用',
    TransactionDeniedByUser: '交易被用户拒绝。',
    LedgerUnSupportSignError: '签名此交易时出错。Ledger 不支持该方法。',
    switchSucc: '切换成功！',
    PleaseEnterWalletName: '请输入钱包名',
    AddressAdded: '添加成功',
    switchOnePasswordFirst: '请先切换到新的密码管理模式',
    copied: '已复制！',
    exceedDepositLimit: '超过最大存入值',
    exceedWithdrawalLimit: '超过最大取出值',
  };
  private JA: NotificationContent = {
    close: '閉じる',
    hiddenSucc: '非表示に成功しました！',
    clearSuccess: 'クリアに成功しました！',
    addSucc: '追加に成功しました！',
    balanceLack: '残高が不足しています',
    wentWrong: '問題が発生しました',
    verifyFailed: '認証に失敗しました',
    checkInput: '入力内容をご確認ください',
    txFailed: '取引に失敗しました',
    nameModifySucc: '名前の変更に成功しました！',
    networkModifySucc: 'ネットワークの変更に成功しました！',
    walletCreateFailed: 'ウォレットの作成に失敗しました',
    walletImportFailed: 'ウォレットのインポートに失敗、または既に存在します',
    existingWallet: 'ウォレットは既に存在します',
    wrongAddress: '正しいアドレスを入力してください',
    nep6Wrong: '正しいファイルを選択してください',
    insufficientBalance: '手数料を支払うためのGASが不足しています！必要量：',
    butOnlyHad: 'しかし、保有量は',
    insufficientSystemFee: '手数料を含めると残高が不足しています',
    rpcError: 'RPCがエラーを返しました',
    InsufficientNetworkFee: 'ネットワーク手数料が不足しています',
    InsufficientGas: 'GASが不足しており、手数料を支払えません',
    TransactionDeniedByUser: 'ユーザーによって取引が拒否されました。',
    LedgerUnSupportSignError:
      '署名中にエラーが発生しました。Ledgerはこの方法をサポートしていません。',
    switchSucc: '切り替えに成功しました！',
    PleaseEnterWalletName: 'ウォレット名を入力してください',
    AddressAdded: 'アドレスを追加しました',
    switchOnePasswordFirst:
      'まずは新しいパスワード管理モードに切り替えてください',
    copied: 'コピーしました！',
    exceedDepositLimit: '最大入金制限を超えています',
    exceedWithdrawalLimit: '最大出金制限を超えています',
  };
  constructor(private settingState: SettingState) {
    this.content = this.EN;
    this.settingState.langSub.subscribe((res) => {
      switch (res) {
        case 'zh_CN':
          this.content = this.CN;
          break;
        case 'ja':
          this.content = this.JA;
          break;
        default:
          this.content = this.EN;
          break;
      }
    });
  }
}
