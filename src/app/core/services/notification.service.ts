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
  existingMnemonicWallet: string;
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
  exceedBridgeCapacity: string;
  EstimateFeeNetworkError: string;
  getBridgeInfoFailed: string;
  perpsOrderCanceled: string;
  perpsOrderFilled: string;
  perpsOrderPartiallyFilled: string;
  perpsOrderResting: string;
  perpsOrderUnfilled: string;
  perpsOrderRejected: string;
  perpsOrderUnknown: string;
  perpsLeverageUpdateFailed: string;
  perpsOrderStatusResolved: string;
  perpsMarketChangedReviewAgain: string;
  perpsPositionChangedReviewAgain: string;
  perpsDepositSubmitted: string;
  perpsDepositStillPending: string;
  perpsDepositReverted: string;
  perpsWithdrawSubmitted: string;
  perpsWithdrawStatusUnknown: string;
  perpsSigningUnavailable: string;
  perpsRefreshFailed: string;
  perpsFeeQuoteChangedReviewAgain: string;
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
    existingWallet: 'Wallet {name} ({address}) already exists',
    existingMnemonicWallet: 'Wallet group {name} already exists',
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
    exceedBridgeCapacity: 'Bridge capacity is not enough, remaining',
    EstimateFeeNetworkError:
      'Network error: unable to fetch the gas fee right now. Please try again later.',
    getBridgeInfoFailed:
      'Unable to load the bridge fee and limits. Please try again later.',
    perpsOrderCanceled: 'Order canceled.',
    perpsOrderFilled: 'Order filled.',
    perpsOrderPartiallyFilled:
      'Order partially filled. Check the remaining position before retrying.',
    perpsOrderResting: 'Limit order placed and resting.',
    perpsOrderUnfilled: 'Market order was not filled. No retry was sent.',
    perpsOrderRejected:
      'Order rejected. Check the current market and account state.',
    perpsOrderUnknown:
      'Order status is unknown. Do not retry until open orders and fills are refreshed.',
    perpsLeverageUpdateFailed:
      'Leverage could not be set, so no order was submitted. Try again.',
    perpsOrderStatusResolved:
      'Order status was recovered. Account data has been refreshed.',
    perpsMarketChangedReviewAgain:
      'The price moved beyond your max slippage. Nothing was sent — review the order again.',
    perpsPositionChangedReviewAgain:
      'Your position changed before the order was signed. Review it again.',
    perpsDepositSubmitted: 'Deposit initiated. Waiting for USDC to arrive in your Hyperliquid account.',
    perpsDepositStillPending:
      'Deposit is on chain but not confirmed yet. It may still land — check the transaction before sending another.',
    perpsDepositReverted:
      'The deposit failed on chain. Nothing was transferred, but the network fee was still spent.',
    perpsWithdrawSubmitted: 'Withdrawal initiated. Waiting for USDC to arrive in your Arbitrum wallet.',
    perpsWithdrawStatusUnknown:
      'The exchange did not return a result, so it is unknown whether this withdrawal ran. Check your balance and the Hyperliquid ledger before sending it again.',
    perpsSigningUnavailable:
      'This wallet does not support Hyperliquid typed-data signing yet.',
    perpsRefreshFailed:
      'Could not confirm the latest balance, so nothing was sent. Try again.',
    perpsFeeQuoteChangedReviewAgain:
      'The fee quote changed. Review it again before submitting.',
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
    existingWallet: '钱包 {name}（{address}）已经存在',
    existingMnemonicWallet: '钱包组 {name} 已经存在',
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
    exceedBridgeCapacity: '跨链桥容量不足，剩余可存入',
    EstimateFeeNetworkError: '网络异常，暂时无法获取手续费，请稍后重试。',
    getBridgeInfoFailed: '暂时无法获取跨链手续费和限额，请稍后重试。',
    perpsOrderCanceled: '订单已撤销。',
    perpsOrderFilled: '订单已全部成交。',
    perpsOrderPartiallyFilled: '订单部分成交，重试前请检查剩余持仓。',
    perpsOrderResting: '限价单已挂单。',
    perpsOrderUnfilled: '市价单未成交，未自动重试。',
    perpsOrderRejected: '订单被拒绝，请检查当前市场与账户状态。',
    perpsOrderUnknown: '订单状态未知，请在刷新挂单与成交记录前不要重试。',
    perpsLeverageUpdateFailed: '杠杆设置失败，订单未提交，请重试。',
    perpsOrderStatusResolved: '已恢复订单状态，并刷新账户数据。',
    perpsMarketChangedReviewAgain:
      '价格变动已超过你设置的最大滑点，订单未发出，请重新审核。',
    perpsPositionChangedReviewAgain: '签名前仓位已发生变化，请重新审核订单。',
    perpsDepositSubmitted: '存入已发起，等待 USDC 到达 Hyperliquid 账户。',
    perpsDepositStillPending:
      '存入已上链但尚未确认，仍可能成功。再次发送前请先查询该笔交易。',
    perpsDepositReverted:
      '存入交易在链上失败。资金未转出，但网络费已消耗。',
    perpsWithdrawSubmitted: '提现已发起，等待 USDC 到达 Arbitrum 钱包。',
    perpsWithdrawStatusUnknown:
      '交易所未返回结果，本次提款是否已执行无法判定。请先核对余额与 Hyperliquid 账本，再决定是否重新发起。',
    perpsSigningUnavailable: '该钱包暂不支持 Hyperliquid 类型化数据签名。',
    perpsRefreshFailed: '无法取得最新余额，未发起任何操作，请重试。',
    perpsFeeQuoteChangedReviewAgain: '费用报价已变化。提交前请重新确认。',
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
    existingWallet: 'ウォレット {name}（{address}）は既に存在します',
    existingMnemonicWallet: 'ウォレットグループ {name} は既に存在します',
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
    exceedBridgeCapacity: 'ブリッジの残り容量が不足しています。残り',
    EstimateFeeNetworkError:
      'ネットワークエラー：現在ガス料金を取得できません。後でもう一度お試しください。',
    getBridgeInfoFailed:
      'ブリッジの手数料と上限を取得できません。後でもう一度お試しください。',
    perpsOrderCanceled: '注文をキャンセルしました。',
    perpsOrderFilled: '注文は全て約定しました。',
    perpsOrderPartiallyFilled: '注文は一部約定しました。再試行前に残りのポジションを確認してください。',
    perpsOrderResting: '指値注文を発注しました。',
    perpsOrderUnfilled: '成行注文は約定しませんでした。自動再試行は行っていません。',
    perpsOrderRejected: '注文が拒否されました。現在の市場と口座の状態を確認してください。',
    perpsOrderUnknown: '注文状態が不明です。未決注文と約定履歴を更新するまで再試行しないでください。',
    perpsLeverageUpdateFailed: 'レバレッジを設定できなかったため、注文は送信されていません。再試行してください。',
    perpsOrderStatusResolved: '注文状態を復元し、口座データを更新しました。',
    perpsMarketChangedReviewAgain:
      '価格が最大スリッページを超えて変動したため、注文は送信されませんでした。もう一度確認してください。',
    perpsPositionChangedReviewAgain:
      '署名前にポジションが変化しました。もう一度確認してください。',
    perpsDepositSubmitted: '入金を開始しました。Hyperliquid アカウントへの USDC の反映をお待ちください。',
    perpsDepositStillPending:
      '入金はチェーンに送信済みですが未確認です。成立する可能性があるため、再送前に取引を確認してください。',
    perpsDepositReverted:
      '入金トランザクションがチェーン上で失敗しました。資金は送られていませんが、ネットワーク手数料は消費されています。',
    perpsWithdrawSubmitted: '出金を開始しました。Arbitrum ウォレットへの USDC の着金をお待ちください。',
    perpsWithdrawStatusUnknown:
      '取引所から結果が返らなかったため、この出金が実行されたかどうかは不明です。残高と Hyperliquid の台帳を確認してから、再送するか判断してください。',
    perpsSigningUnavailable:
      'このウォレットはHyperliquidの型付きデータ署名にまだ対応していません。',
    perpsRefreshFailed:
      '最新の残高を確認できなかったため、何も送信していません。再試行してください。',
    perpsFeeQuoteChangedReviewAgain:
      '手数料の見積もりが変わりました。送信する前にもう一度確認してください。',
  };
  private KO: NotificationContent = {
    close: '닫기',
    hiddenSucc: '숨기기 성공!',
    clearSuccess: '지우기 성공!',
    addSucc: '추가 성공!',
    balanceLack: '잔액 부족',
    wentWrong: '문제가 발생했습니다',
    verifyFailed: '검증 실패',
    checkInput: '입력 내용을 확인하세요',
    txFailed: '트랜잭션 실패',
    nameModifySucc: '이름 변경 성공!',
    networkModifySucc: '네트워크 변경 성공!',
    walletCreateFailed: '지갑 생성 실패',
    walletImportFailed: '지갑 가져오기 실패 또는 이미 존재합니다',
    existingWallet: '지갑 {name}({address})이(가) 이미 존재합니다',
    existingMnemonicWallet: '지갑 그룹 {name}이(가) 이미 존재합니다',
    wrongAddress: '올바른 주소를 입력하세요',
    nep6Wrong: '올바른 파일을 선택하세요',
    insufficientBalance: '수수료 지불에 필요한 GAS가 부족합니다! 필요량',
    butOnlyHad: '보유량',
    insufficientSystemFee: '가스 수수료를 포함하면 잔액이 부족합니다',
    rpcError: 'RPC 오류',
    InsufficientNetworkFee: '네트워크 수수료 부족',
    InsufficientGas: '수수료를 지불할 GAS가 부족합니다',
    TransactionDeniedByUser: '사용자가 트랜잭션을 거부했습니다.',
    LedgerUnSupportSignError:
      '이 트랜잭션 서명 중 오류가 발생했습니다. Ledger는 이 방식을 지원하지 않습니다.',
    switchSucc: '전환 성공!',
    PleaseEnterWalletName: '지갑 이름을 입력하세요',
    AddressAdded: '주소가 추가되었습니다',
    switchOnePasswordFirst: '먼저 새 비밀번호 관리 모드로 전환하세요',
    copied: '복사됨!',
    exceedDepositLimit: '최대 입금 한도를 초과했습니다',
    exceedWithdrawalLimit: '최대 출금 한도를 초과했습니다',
    exceedBridgeCapacity: '브리지 잔여 한도가 부족합니다. 잔여',
    EstimateFeeNetworkError:
      '네트워크 오류: 현재 가스 수수료를 가져올 수 없습니다. 나중에 다시 시도해 주세요.',
    getBridgeInfoFailed:
      '브리지 수수료와 한도를 가져올 수 없습니다. 나중에 다시 시도해 주세요.',
    perpsOrderCanceled: '주문을 취소했습니다.',
    perpsOrderFilled: '주문이 전부 체결되었습니다.',
    perpsOrderPartiallyFilled: '주문이 일부 체결되었습니다. 다시 시도하기 전에 남은 포지션을 확인하세요.',
    perpsOrderResting: '지정가 주문이 등록되었습니다.',
    perpsOrderUnfilled: '시장가 주문이 체결되지 않았습니다. 자동 재시도하지 않았습니다.',
    perpsOrderRejected: '주문이 거부되었습니다. 현재 시장 및 계정 상태를 확인하세요.',
    perpsOrderUnknown:
      '주문 상태를 확인할 수 없습니다. 미체결 주문과 체결 내역을 갱신하기 전에는 다시 시도하지 마세요.',
    perpsLeverageUpdateFailed: '레버리지를 설정하지 못해 주문이 제출되지 않았습니다. 다시 시도해 주세요.',
    perpsOrderStatusResolved: '주문 상태를 복구하고 계정 데이터를 갱신했습니다.',
    perpsMarketChangedReviewAgain:
      '가격이 최대 슬리피지를 넘어 변동해 주문을 보내지 않았습니다. 다시 검토해 주세요.',
    perpsPositionChangedReviewAgain:
      '서명 전에 포지션이 변경되었습니다. 다시 검토해 주세요.',
    perpsDepositSubmitted: '입금을 시작했습니다. USDC가 Hyperliquid 계정에 도착할 때까지 기다려 주세요.',
    perpsDepositStillPending:
      '입금이 체인에 전송되었으나 아직 확인되지 않았습니다. 성사될 수 있으니 재전송 전에 거래를 확인하세요.',
    perpsDepositReverted:
      '입금 트랜잭션이 체인에서 실패했습니다. 자금은 이동하지 않았지만 네트워크 수수료는 소모되었습니다.',
    perpsWithdrawSubmitted: '출금을 시작했습니다. USDC가 Arbitrum 지갑에 도착할 때까지 기다려 주세요.',
    perpsWithdrawStatusUnknown:
      '거래소가 결과를 반환하지 않아 이 출금이 실행되었는지 알 수 없습니다. 잔액과 Hyperliquid 장부를 확인한 뒤 다시 보낼지 결정하세요.',
    perpsSigningUnavailable:
      '이 지갑은 아직 Hyperliquid 형식화 데이터 서명을 지원하지 않습니다.',
    perpsRefreshFailed:
      '최신 잔액을 확인하지 못해 아무것도 전송하지 않았습니다. 다시 시도하세요.',
    perpsFeeQuoteChangedReviewAgain:
      '수수료 견적이 변경되었습니다. 제출하기 전에 다시 확인하세요.',
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
        case 'ko':
          this.content = this.KO;
          break;
        default:
          this.content = this.EN;
          break;
      }
    });
  }
}
