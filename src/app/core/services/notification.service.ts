import { Injectable } from '@angular/core';
import { ChromeService } from './chrome.service';

@Injectable()
export class NotificationService {
    content: any;
    EN = {
        close: 'Close',
        copied: 'Copied!',
        hiddenSucc: 'Hidden success!',
        addSucc: 'Add success!',
        loginSucc: 'Login success!',
        loginFailed: 'Login failed',
        balanceLack: 'Not enough balance',
        checkAddress: 'Please check your address',
        wentWrong: 'Something went wrong',
        verifyFailed: 'Verify Failed',
        langSetSucc: 'Switched language!',
        checkInput: 'Please check your input',
        signFailed: 'Signature failed',
        transferFailed: 'Transfer failed',
        nameModifySucc: 'Name modify success!',
        nameModifyFailed: 'Name modify failed',
        walletCreateSucc: 'Wallet creation success!',
        walletCreateFailed: 'Wallet creation failed',
        walletImportFailed: 'Wallet import failed',
        existingWallet: 'Wallet already exists',
        wrongAddress: 'Please enter a legal address',
        rejected: 'Rejected',
        rateCurrencySetSucc: 'Asset conversion target revised successfully!',
        rateChannelSetSucc: 'Reference source modified successfully!'
    };
    CN = {
        close: '关闭',
        copied: '已复制!',
        hiddenSucc: '隐藏成功!',
        addSucc: '添加成功!',
        loginSucc: '登录成功!',
        loginFailed: '登录失败',
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
        walletImportFailed: '钱包创建失败',
        existingWallet: '钱包已经存在',
        wrongAddress: '请输入合法地址',
        rejected: '已拒绝',
        rateCurrencySetSucc: '资产兑换目标修改成功',
        rateChannelSetSucc: '参考来源修改成功'
    };
    constructor(
        public chrome: ChromeService
    ) {
        this.content = this.EN;
        this.chrome.getLang().subscribe(res => {
            if (res === 'zh_CN') {
                this.content = this.CN;
            }
        });
    }
}
