import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import {
    ChromeService,
    NeonService,
    GlobalService,
    SettingState,
} from '@app/core';

@Component({
    templateUrl: './name.dialog.html',
    styleUrls: ['./name.dialog.scss'],
})
export class PopupNameDialogComponent implements OnInit {
    public name = '';
    public limit;

    constructor(
        private dialogRef: MatDialogRef<PopupNameDialogComponent>,
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        private settingState: SettingState,
        @Inject(MAT_DIALOG_DATA) private chooseWallet: any
    ) {
    }

    async ngOnInit() {
        this.limit = await this.settingState.getWalletInitConstant();
    }

    public cancel() {
        this.dialogRef.close();
    }

    public updateName() {
        if (this.name.trim() === '') {
            return;
        }
        this.neon.updateWalletName(this.name, this.chooseWallet).subscribe(
            (res: any) => {
                this.chrome.setWallet(res.export());
                this.neon.walletArr.find(
                    (item) =>
                        item.accounts[0].address === res.accounts[0].address
                ).name = this.name;
                this.chrome.setWalletArray(
                    this.neon.getWalletArrayJSON(),
                    this.neon.currentWalletChainType
                );
                this.dialogRef.close();
                this.global.snackBarTip('nameModifySucc');
            },
            (err: any) => {
                this.global.log('update wallet name faild', err);
                this.global.snackBarTip('nameModifyFailed');
            }
        );
    }
}
