import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { ChromeService, NeonService } from '@app/core';
import { WalletJSON } from '@cityofzion/neon-core/lib/wallet';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-js-neo3';

@Component({
    templateUrl: 'address.dialog.html',
    styleUrls: ['address.dialog.scss'],
})
export class PopupAddressDialogComponent implements OnInit {
    neonWallet: any = wallet2;

    public address: string = '';

    public addressArr: Array<WalletJSON> = [];

    constructor(
        private dialogRef: MatDialogRef<PopupAddressDialogComponent>,
        private chromeSer: ChromeService,
        private neonService: NeonService
    ) {
        switch (this.neonService.currentWalletChainType) {
            case 'Neo2':
                this.neonWallet = wallet2;
                break;
            case 'Neo3':
                this.neonWallet = wallet3;
                break;
        }
    }

    ngOnInit() {
        this.chromeSer.getWalletArray(this.neonService.currentWalletChainType).subscribe((res) => {
            this.addressArr = res;
        });
    }

    public checkAddress(inputStr: string) {
        if (this.neonWallet.isAddress(inputStr)) {
            this.dialogRef.close(inputStr);
        }
    }

    public select(selectAddress: string) {
        this.dialogRef.close(selectAddress);
    }

    public getAddressSub(address: string) {
        return `${address.substr(0, 6)}...${address.substr(
            address.length - 7,
            address.length - 1
        )} `;
    }
}
