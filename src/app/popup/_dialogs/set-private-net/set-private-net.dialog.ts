import { Component, OnInit, Inject } from '@angular/core';
import { RpcNetwork, STORAGE_NAME, ChainType, NetworkType } from '../../_lib';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { HomeService, GlobalService, ChromeService } from '@/app/core';
import { wallet } from '@cityofzion/neon-core-neo3';

@Component({
    templateUrl: 'set-private-net.dialog.html',
    styleUrls: ['set-private-net.dialog.scss'],
})
export class PopupSetPrivateNetDialogComponent implements OnInit {
    privateNet: RpcNetwork;

    constructor(
        @Inject(MAT_DIALOG_DATA) public sourceData: RpcNetwork,
        private homeSer: HomeService,
        private global: GlobalService,
        private chrome: ChromeService
    ) {}

    ngOnInit() {
        this.privateNet = {
            ...this.sourceData,
            rpcUrl: '',
            explorer: '',
        };
    }
    confirm() {
        if (!this.privateNet.rpcUrl) {
            return;
        }
        if (
            this.privateNet.rpcUrl === this.sourceData.rpcUrl &&
            this.privateNet.explorer === this.sourceData.explorer
        ) {
            return;
        }
        this.homeSer.getRpcUrlMessage(this.privateNet.rpcUrl).subscribe(
            (res) => {
                console.log(res);
                if (this.sourceData.name.includes('N3')) {
                    this.selectPrivateNet('Neo3', res);
                } else {
                    this.selectPrivateNet('Neo2');
                }
            },
            () => {
                this.global.snackBarTip('请输入正确的地址');
            }
        );
    }

    async selectPrivateNet(chainType: ChainType, response?) {
        if (chainType === 'Neo2') {
            this.global.n2Networks[2] = {
                ...this.global.n2Networks[2],
                rpcUrl: this.privateNet.rpcUrl,
                explorer: this.privateNet.explorer,
            };
            this.chrome.setStorage(
                STORAGE_NAME.n2Networks,
                this.global.n2Networks
            );
            this.chrome.setStorage(STORAGE_NAME.n2SelectedNetworkIndex, 2);
            this.global.n2SelectedNetworkIndex = 2;
            this.global.n2Network = this.global.n2Networks[2];
        } else {
            this.global.n3Networks[2] = {
                ...this.global.n3Networks[2],
                magicNumber: response.protocol.network,
                rpcUrl: this.privateNet.rpcUrl,
                explorer: this.privateNet.explorer,
            };
            this.chrome.setStorage(
                STORAGE_NAME.n3Networks,
                this.global.n3Networks
            );
            this.chrome.setStorage(STORAGE_NAME.n3SelectedNetworkIndex, 2);
            this.global.n3SelectedNetworkIndex = 2;
            this.global.n3Network = this.global.n3Networks[2];
        }
        if (this.privateNet.rpcUrl !== this.sourceData.rpcUrl) {
            this.chrome.resetWatch(chainType, NetworkType.PrivateNet);
            const transactions = await this.chrome
                .getStorage(STORAGE_NAME.transaction)
                .toPromise();
            if (chainType === 'Neo2') {
                if (transactions && transactions[NetworkType.PrivateNet]) {
                    Object.keys(transactions[NetworkType.PrivateNet]).forEach(
                        (address) => {
                            if (wallet.isAddress(address, 23)) {
                                transactions[NetworkType.PrivateNet][address] =
                                    {};
                            }
                        }
                    );
                }
            } else {
                if (transactions && transactions[NetworkType.PrivateNet]) {
                    Object.keys(transactions[NetworkType.PrivateNet]).forEach(
                        (address) => {
                            if (wallet.isAddress(address, 53)) {
                                transactions[NetworkType.PrivateNet][address] =
                                    {};
                            }
                        }
                    );
                }
            }
            this.chrome.setStorage(STORAGE_NAME.transaction, transactions);
        }
        location.reload();
    }
}
