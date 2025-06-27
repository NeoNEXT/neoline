import { Injectable } from '@angular/core';
import { SettingState } from '../states/setting.state';

interface NotificationContent {
  close: string;
  hiddenSucc: string;
  clearSuccess: string;
  addSucc: string;
  loginSucc: string;
  balanceLack: string;
  checkAddress: string;
  wentWrong: string;
  verifyFailed: string;
  langSetSucc: string;
  checkInput: string;
  signFailed: string;
  transferFailed: string;
  nameModifySucc: string;
  networkModifySucc: string;
  nameModifyFailed: string;
  walletCreateSucc: string;
  walletCreateFailed: string;
  walletImportFailed: string;
  existingWallet: string;
  wrongAddress: string;
  rejected: string;
  rateCurrencySetSucc: string;
  nep6Wrong: string;
  agreePrivacyPolicy: string;
  insufficientBalance: string;
  butOnlyHad: string;
  insufficientSystemFee: string;
  rpcError: string;
  InsufficientNetworkFee: string;
  InsufficientGas: string;
  Invalid_RPC_URL: string;
  TransactionDeniedByUser: string;
  LedgerUnSupportSignError: string;
  switchSucc: string;
  PleaseEnterWalletName: string;
  AddressAdded: string;
  switchOnePasswordFirst: string;
  copied: string;
  exceedDepositLimit: string;
  ledgerNotSupportMethod: string;
}

@Injectable()
export class NotificationService {
  public content: any;
  private EN: NotificationContent = {
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
    networkModifySucc: 'Network modify success!',
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
    exceedDepositLimit: 'Exceeding the maximum deposit limit',
    ledgerNotSupportMethod:
      'Your hardware wallet does not support this method.',
  };
  private CN: NotificationContent = {
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
    networkModifySucc: '网络修改成功！',
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
    LedgerUnSupportSignError: '签名此交易时出错。Ledger 不支持该方法。',
    switchSucc: '切换成功！',
    PleaseEnterWalletName: '请输入钱包名',
    AddressAdded: '添加成功',
    switchOnePasswordFirst: '请先切换到新的密码管理模式',
    copied: '已复制！',
    exceedDepositLimit: '超过最大存入值',
    ledgerNotSupportMethod: '你的 Ledger 钱包不支持该方法。',
  };
  private JA: NotificationContent = {
    close: '閉じる',
    hiddenSucc: '非表示に成功しました！',
    clearSuccess: 'クリアに成功しました！',
    addSucc: '追加に成功しました！',
    loginSucc: 'ログインに成功しました！',
    balanceLack: '残高が不足しています',
    checkAddress: 'アドレスをご確認ください',
    wentWrong: '問題が発生しました',
    verifyFailed: '認証に失敗しました',
    langSetSucc: '言語が切り替えられました！',
    checkInput: '入力内容をご確認ください',
    signFailed: '署名に失敗しました',
    transferFailed: '送金に失敗しました',
    nameModifySucc: '名前の変更に成功しました！',
    networkModifySucc: 'ネットワークの変更に成功しました！',
    nameModifyFailed: '名前の変更に失敗しました',
    walletCreateSucc: 'ウォレットの作成に成功しました！',
    walletCreateFailed: 'ウォレットの作成に失敗しました',
    walletImportFailed: 'ウォレットのインポートに失敗、または既に存在します',
    existingWallet: 'ウォレットは既に存在します',
    wrongAddress: '正しいアドレスを入力してください',
    rejected: '拒否されました',
    rateCurrencySetSucc: '資産換算の対象が正常に変更されました！',
    nep6Wrong: '正しいファイルを選択してください',
    agreePrivacyPolicy: 'プライバシーポリシーに同意してください',
    insufficientBalance: '手数料を支払うためのGASが不足しています！必要量：',
    butOnlyHad: 'しかし、保有量は',
    insufficientSystemFee: '手数料を含めると残高が不足しています',
    rpcError: 'RPCエラーが発生しました。コンソールをご確認ください。',
    InsufficientNetworkFee: 'ネットワーク手数料が不足しています',
    InsufficientGas: 'GASが不足しており、手数料を支払えません',
    Invalid_RPC_URL: '無効なRPC URLです',
    TransactionDeniedByUser: 'ユーザーによって取引が拒否されました。',
    LedgerUnSupportSignError: '署名中にエラーが発生しました。Ledgerはこの方法をサポートしていません。',
    switchSucc: '切り替えに成功しました！',
    PleaseEnterWalletName: 'ウォレット名を入力してください',
    AddressAdded: 'アドレスを追加しました',
    switchOnePasswordFirst: 'まずは新しいパスワード管理モードに切り替えてください',
    copied: 'コピーしました！',
    exceedDepositLimit: '最大入金制限を超えています',
    ledgerNotSupportMethod: 'お使いのハードウェアウォレットはこの方法に対応していません',
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
