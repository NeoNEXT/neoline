import {
    Component,
    OnInit,
    Inject
} from '@angular/core';
import {
    MatDialogRef, MAT_DIALOG_DATA
} from '@angular/material';
import {
    ChromeService,
    NeonService,
    GlobalService,
} from '@app/core';

@Component({
    templateUrl: './name.dialog.html',
    styleUrls: ['./name.dialog.scss']
})
export class PopupNameDialogComponent implements OnInit {
    public name = '';

    constructor(
        private dialogRef: MatDialogRef < PopupNameDialogComponent > ,
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        @Inject(MAT_DIALOG_DATA) private chooseWallet: any
    ) {}

    ngOnInit() {}

    public cancel() {
        this.dialogRef.close();
    }

    public updateName() {
        this.neon.updateWalletName(this.name, this.chooseWallet)
            .subscribe(
                (res: any) => {
                    this.chrome.setWallet(res.export());
                    this.neon.walletArr.find((item) => item.accounts[0].address === res.accounts[0].address).name = this.name;
                    this.chrome.setWalletArray(this.neon.getWalletArrayJSON());
                    this.dialogRef.close();
                    this.global.snackBarTip('nameModifySucc');
                },
                (err: any) => {
                    this.global.log('update wallet name faild', err);
                    this.global.snackBarTip('nameModifyFailed');
                });
    }
}
