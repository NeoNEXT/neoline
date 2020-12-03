import { Component, ViewChild, ElementRef } from '@angular/core';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { Wallet } from '@cityofzion/neon-core/lib/wallet';
import { NeonService, ChromeService, GlobalService } from '@/app/core';
import { Router } from '@angular/router';
import { EVENT } from '@/models/dapi';
import { PopupSelectDialogComponent } from '../select/select.dialog';
import { ChainTypeGroups, ChainType } from '@popup/_lib';

@Component({
    templateUrl: 'home-menu.dialog.html',
    styleUrls: ['home-menu.dialog.scss'],
})
export class PopupHomeMenuDialogComponent {
    @ViewChild('walletContainer') private walletContainer: ElementRef;
    public walletArr: { Neo2: Wallet[]; Neo3: Wallet[] } = {
        Neo2: [],
        Neo3: [],
    };
    public wallet: Wallet;
    public tabType: ChainType;
    constructor(
        private router: Router,
        private chrome: ChromeService,
        private dialogRef: MatDialogRef<PopupHomeMenuDialogComponent>,
        private neon: NeonService,
        private global: GlobalService,
        private dialog: MatDialog
    ) {
        this.walletArr.Neo2 = this.neon.neo2WalletArr;
        this.walletArr.Neo3 = this.neon.neo3WalletArr;
        this.wallet = this.neon.wallet;
        this.tabType = this.neon.currentWalletChainType;
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
            this.walletContainer.nativeElement.scrollTo(
                0,
                this.walletContainer.nativeElement.scrollHeight
            );
        } catch (err) {}
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
                label: this.wallet.name,
            },
            return: EVENT.ACCOUNT_CHANGED,
        });
        location.href = `index.html#popup`;
        this.chrome.setHaveBackupTip(null);
    }

    public lock() {
        this.dialogRef.close('lock');
        this.chrome.clearLogin();
        this.router.navigateByUrl('/popup/login');
    }

    to(type: 'create' | 'import') {
        this.dialog
            .open(PopupSelectDialogComponent, {
                data: {
                    optionGroup: ChainTypeGroups,
                    type: 'chain',
                },
                panelClass: 'custom-dialog-panel',
            })
            .afterClosed()
            .subscribe((chain) => {
                if (!chain) {
                    return;
                }
                if (type === 'create') {
                    this.router.navigateByUrl('/popup/wallet/create');
                } else {
                    this.router.navigateByUrl('/popup/wallet/import');
                }
            });
    }
}
