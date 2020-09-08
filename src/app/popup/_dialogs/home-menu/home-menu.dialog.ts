import { Component, ViewChild, ElementRef } from '@angular/core';
import {
    MatDialogRef
} from '@angular/material/dialog';
import {
    Wallet
} from '@cityofzion/neon-core/lib/wallet';
import { NeonService, ChromeService, GlobalService } from '@/app/core';
import { Router } from '@angular/router';
import { EVENT } from '@/models/dapi';


@Component({
    templateUrl: 'home-menu.dialog.html',
    styleUrls: ['home-menu.dialog.scss']
})
export class PopupHomeMenuDialogComponent {
    @ViewChild('walletContainer') private walletContainer: ElementRef;
    public walletArr: Array<Wallet>;
    public wallet: Wallet;
    constructor(
        private router: Router,
        private chrome: ChromeService,
        private dialogRef: MatDialogRef<PopupHomeMenuDialogComponent>,
        private neon: NeonService,
        private global: GlobalService
    ) {
        this.walletArr = this.neon.walletArr;
        this.wallet = this.neon.wallet;
    }
    public isActivityWallet(w: Wallet) {
        if (w.accounts[0].address === this.wallet.accounts[0].address) {
            return true;
        } else {
            return false;
        }
    }
    public scrollToBottom() {
        try {
            this.walletContainer.nativeElement.scrollTo(0,this.walletContainer.nativeElement.scrollHeight)
        } catch(err) {

        }
    }

    public dismiss() {
        this.dialogRef.close();
    }

    public selectAccount(w: Wallet) {
        this.wallet = this.neon.parseWallet(w);
        this.chrome.setWallet(this.wallet.export());
        this.chrome.windowCallback({
            data: {
                address: this.wallet.accounts[0].address,
                label: this.wallet.name
            },
            return: EVENT.ACCOUNT_CHANGED
        });
        location.href = `index.html#popup`;
    }

    public lock() {
        this.dialogRef.close('lock');
        this.chrome.clearLogin();
        this.router.navigateByUrl('/popup/login');
    }
}
