import {
    Component,
    OnInit
} from '@angular/core';
import {
    Wallet
} from '@cityofzion/neon-core/lib/wallet';
import {
    NeonService, GlobalService
} from '@app/core';
import {
    Router
} from '@angular/router';
import {
    MatDialog,
} from '@angular/material/dialog';
import {
    PopupNameDialogComponent
} from '@popup/_dialogs';

declare var QRCode: any;

@Component({
    templateUrl: 'account.component.html',
    styleUrls: ['account.component.scss']
})
export class AccountComponent implements OnInit {
    public w: Wallet;
    public address: string;
    constructor(
        private neon: NeonService,
        private router: Router,
        private dialog: MatDialog,
        private global: GlobalService
    ) {}

    ngOnInit(): void {
        this.w = this.neon.wallet;
        this.address = this.neon.address;
        if (QRCode) {
            let qrcode = new QRCode('qrcode', {
                text: this.address,
                width: 178,
                height: 178,
                colorDark: '#333333',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        }
    }

    public copied() {
        this.global.snackBarTip('copied');
    }

    public export() {
        this.router.navigate([{
            outlets: {
                transfer: ['transfer', 'export']
            }
        }]);
    }

    public updateName() {
        return this
            .dialog
            .open(PopupNameDialogComponent);
    }
}
