import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { SLIP44, ChainType, STORAGE_NAME } from '@/app/popup/_lib';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { NeonService, ChromeService, GlobalService } from '@/app/core';

@Component({
    selector: 'app-account-name',
    templateUrl: 'account-name.component.html',
    styleUrls: ['account-name.component.scss'],
})
export class AccountNameComponent implements OnInit {
    @Input() accountData;
    @Input() chainType: ChainType;
    @Output() importSuccess = new EventEmitter();

    name = '';

    constructor(
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService
    ) {}

    ngOnInit(): void {}

    importLedgerWallet() {
        if (this.checkName() === false) {
            return;
        }
        const { account, index } = this.accountData;
        console.log(account);
        console.log(this.chainType);
        const accountLike = account.export();
        accountLike.extra = {
            publicKey: account.publicKey,
            ledgerAddressIndex: index,
            ledgerSLIP44: SLIP44[this.chainType],
        };
        if (this.chainType === 'Neo2') {
            const w = new wallet2.Wallet({ name: this.name });
            w.addAccount(accountLike);
            const isEfficient = this.neon.verifyWallet(w);
            if (isEfficient) {
                this.neon.selectChainType('Neo2');
                this.neon.pushWIFArray('');
                this.chrome.setStorage(STORAGE_NAME.WIFArr, this.neon.WIFArr);
                this.neon.pushWalletArray(w.export());
                this.chrome.setStorage(
                    STORAGE_NAME.walletArr,
                    this.neon.getWalletArrayJSON()
                );
                this.chrome.setWallet(w.export());
                this.global.$wallet.next('open');
                this.importSuccess.emit();
            } else {
                this.global.snackBarTip('existingWallet');
            }
        } else {
            const w = new wallet3.Wallet({ name: this.name });
            w.addAccount(accountLike);
            const isEfficient = this.neon.verifyWallet(w);
            if (isEfficient) {
                this.neon.selectChainType('Neo3');
                this.neon.pushWIFArray('');
                this.chrome.setStorage(
                    STORAGE_NAME['WIFArr-Neo3'],
                    this.neon.WIFArr
                );
                this.neon.pushWalletArray(w.export());
                this.chrome.setStorage(
                    STORAGE_NAME['walletArr-Neo3'],
                    this.neon.getWalletArrayJSON()
                );
                this.chrome.setWallet(w.export());
                this.global.$wallet.next('open');
                this.importSuccess.emit();
            } else {
                this.global.snackBarTip('existingWallet');
            }
        }
    }

    private checkName() {
        const name = this.name.trim();
        if (name === '') {
            this.global.snackBarTip('请输入钱包名');
            return false;
        }
        return true;
    }
}
