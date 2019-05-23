import { Component, OnInit } from '@angular/core';
import { Wallet } from '@cityofzion/neon-core/lib/wallet';
import { NeonService, ChromeService } from '@/app/core';
import { MatDialog } from '@angular/material';
import { PopupConfirmDialogComponent } from '@/app/popup/_dialogs';

@Component({
    templateUrl: 'wallet.component.html',
    styleUrls: ['wallet.component.scss', './light.scss', './dark.scss']
})
export class SettingWalletComponent implements OnInit {
    public walletArr: Array<Wallet>;
    public wallet: Wallet;
    private oldName = '';
    constructor(
        private neon: NeonService,
        private chrome: ChromeService,
        private dialog: MatDialog,
    ) {
        this.walletArr = this.neon.walletArr;
        this.wallet = this.neon.wallet;
    }

    ngOnInit(): void {
    }

    public isActivityWallet(w: Wallet) {
        if (w.accounts[0].address === this.wallet.accounts[0].address) {
            return true;
        } else {
            return false;
        }
    }

    public chooseAccount(w: Wallet) {
        if (this.isActivityWallet(w)) {
            return;
        } else {
            this.wallet = this.neon.parseWallet(w);
            this.chrome.setWallet(this.wallet.export());
            this.chrome.windowCallback({
                data: {
                    address: this.wallet.accounts[0].address
                },
                target: 'account_changed'
            });
            location.href = `index.html`;
        }
    }

    public removeWallet(w: Wallet) {
        this.dialog.open(PopupConfirmDialogComponent, {
            data: 'delWalletConfirm'
        }).afterClosed().subscribe((confirm) => {
            if (confirm) {
                this.neon.delWallet(w).subscribe(res => {
                    if (res) {
                        this.walletArr = this.neon.walletArr;
                        this.wallet = this.neon.wallet;
                        location.href = `index.html`;
                    } else {
                        this.walletArr = this.neon.walletArr;
                        this.wallet = this.neon.wallet;
                    }
                });
            }
        });
    }

    public focusName(index: number) {
        this.oldName = this.walletArr[index].name;
    }

    public updateName(index: number, event: any) {
        if (this.walletArr[index].name === '') {
            this.walletArr[index].name = this.oldName;
            return;
        }
        if (this.oldName !== '' && this.oldName !== this.walletArr[index].name) {
            this.chrome.setWalletArray(this.neon.getWalletArrayJSON(this.walletArr));
            this.oldName = '';
            if (this.isActivityWallet(this.walletArr[index])) {
                this.wallet.name = this.walletArr[index].name;
                this.chrome.setWallet(this.wallet.export());
            }
        }
        event.target.blur();
    }
}
