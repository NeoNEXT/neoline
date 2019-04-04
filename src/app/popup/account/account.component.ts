import {
    Component,
    OnInit,
    OnDestroy
} from '@angular/core';
import {
    Router
} from '@angular/router';
import {
    MatDialog,
} from '@angular/material';

import {
    PopupQRCodeDialogComponent
} from '@popup/_dialogs';
import {
    PopupNameDialogComponent
} from '@popup/_dialogs';

import {
    ChromeService,
    GlobalService,
    NeonService,
    AssetState,
} from '@app/core';

@Component({
    templateUrl: 'account.component.html',
    styleUrls: ['account.component.scss']
})
export class PopupAccountComponent implements OnInit {
    public address: string;
    public walletName: string;

    constructor(
        private router: Router,
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private asset: AssetState,
        private dialog: MatDialog,
    ) {
        this.address = '';
        this.walletName = '';
    }

    ngOnInit(): void {
        this.address = this.neon.address;
        this.neon.walletSub().subscribe(() => {
            this.walletName = this.neon.wallet.name;
        });
    }

    public wif() {
        this.router.navigate([{
            outlets: {
                transfer: ['transfer', 'export']
            }
        }]);
    }

    public copied() {
        this.global.snackBarTip('copied');
    }

    public qrcode() {
        return this
            .dialog
            .open(
                PopupQRCodeDialogComponent, {
                    data: this.address
                }
            );
    }

    public updateName() {
        return this
            .dialog
            .open(PopupNameDialogComponent);
    }
}
