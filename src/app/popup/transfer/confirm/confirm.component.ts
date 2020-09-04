import {
    Component,
    OnInit,
    Inject
} from '@angular/core';
import {
    MatDialogRef, MAT_DIALOG_DATA,
} from '@angular/material/dialog';

import {
    ChromeService, AssetState, NeonService,
} from '@app/core';

@Component({
    templateUrl: 'confirm.component.html',
    styleUrls: ['confirm.component.scss']
})
export class PopupTransferConfirmComponent implements OnInit {
    public logoUrlArr = [];
    public net = '';
    public fromName: string = '';
    public assetImageUrl: string = '';
    constructor(
        private dialogRef: MatDialogRef<PopupTransferConfirmComponent>,
        private neon: NeonService,
        private assetState: AssetState,
        @Inject(MAT_DIALOG_DATA) public data: {
            fromAddress: string ,
            toAddress: string,
            asset: string,
            amount: string,
            remark: string,
            fee: string,
            network: string,
            broadcastOverride: boolean
        } = {
            fromAddress: '',
            toAddress: '',
            asset: '',
            amount: '',
            remark: '',
            fee: '',
            network: '',
            broadcastOverride: false
        }
    ) { }

    async ngOnInit() {
        const wallet = this.neon.wallet;
        this.fromName = wallet.name;
        this.assetImageUrl = await this.assetState.getAssetImage(this.data.asset)
    }

    public select(index: number) {
        this.dialogRef.close(index);
    }

    public exit() {
        this.dialogRef.close();
    }

    public getAddressSub(address: string) {
        return `${address.substr(0, 3)}...${address.substr(address.length - 4, address.length - 1)} `
    }
}
