import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import {
    ChromeService,
    NeonService,
    UtilServiceState,
    GlobalService,
} from '@app/core';
import { WalletJSON as WalletJSON2 } from '@cityofzion/neon-core/lib/wallet';
import { WalletJSON as WalletJSON3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { STORAGE_NAME } from '../../_lib';
@Component({
    templateUrl: 'address.dialog.html',
    styleUrls: ['address.dialog.scss'],
})
export class PopupAddressDialogComponent implements OnInit {
    public address: string = '';

    public addressArr: Array<WalletJSON2 | WalletJSON3> = [];

    getNnsAddressReq;

    constructor(
        private dialogRef: MatDialogRef<PopupAddressDialogComponent>,
        private chromeSer: ChromeService,
        private neonService: NeonService,
        private util: UtilServiceState,
        private global: GlobalService
    ) {}

    ngOnInit() {
        const storageName =
            this.neonService.currentWalletChainType === 'Neo3'
                ? STORAGE_NAME['walletArr-Neo3']
                : STORAGE_NAME.walletArr;
        this.chromeSer.getStorage(storageName).subscribe((res) => {
            this.addressArr = res;
        });
    }

    pasteAddress($event) {
        const data = (
            $event.clipboardData || (window as any).clipboardData
        ).getData('text');
        this.checkAddress(data);
    }

    public checkAddress(value?: string) {
        const address = value || this.address;
        if (
            this.neonService.currentWalletChainType === 'Neo2'
                ? wallet2.isAddress(address)
                : wallet3.isAddress(address, 53)
        ) {
            this.dialogRef.close(address);
            return;
        }
        if (
            this.neonService.currentWalletChainType === 'Neo3' &&
            this.global.n3Network.chainId === 6
        ) {
            this.getNnsAddressReq?.unsubscribe();
            this.getNnsAddressReq = this.util
                .getN3NnsAddress(
                    address.toLowerCase(),
                    this.global.n3Network.chainId
                )
                .subscribe((nnsAddress) => {
                    if (wallet3.isAddress(nnsAddress, 53)) {
                        this.dialogRef.close({
                            address: address.toLowerCase(),
                            nnsAddress,
                        });
                    } else {
                        this.global.snackBarTip('wrongAddress');
                    }
                });
        } else {
            this.global.snackBarTip('wrongAddress');
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
