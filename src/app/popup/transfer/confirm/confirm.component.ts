import {
    Component,
    OnInit,
    Inject
} from '@angular/core';
import {
    MatDialogRef, MAT_DIALOG_DATA, MatDialog,
} from '@angular/material/dialog';

import {
    UtilServiceState, AssetState, NeonService, GlobalService,
} from '@app/core';
import { NEO, GAS } from '@/models/models';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import { forkJoin } from 'rxjs';
import { bignumber } from 'mathjs';
import { GAS3_CONTRACT, RpcNetwork } from '../../_lib';
import BigNumber from 'bignumber.js';

@Component({
    templateUrl: 'confirm.component.html',
    styleUrls: ['confirm.component.scss']
})
export class PopupTransferConfirmComponent implements OnInit {
    public logoUrlArr = [];
    public network: RpcNetwork;
    public fromName: string = '';
    public datajson: any = {};
    public symbol = ''
    public money;
    public feeMoney;
    public totalMoney;
    public systemFeeMoney;
    public networkFeeMoney;
    public totalFee;
    public rateCurrency = ''

    isNeo3 = false;
    constructor(
        private dialog: MatDialog,
        private dialogRef: MatDialogRef<PopupTransferConfirmComponent>,
        private neon: NeonService,
        private assetState: AssetState,
        private util: UtilServiceState,
        private global: GlobalService,
        @Inject(MAT_DIALOG_DATA) public data: {
            fromAddress: string ,
            toAddress: string,
            symbol: string,
            asset: string,
            amount: string,
            remark: string,
            fee: string,
            networkFee?: any,
            systemFee?: any,
            networkId: number,
            broadcastOverride: boolean,
            txSerialize: string
        } = {
            fromAddress: '',
            toAddress: '',
            symbol: '',
            asset: '',
            amount: '0',
            remark: '',
            fee: '0',
            networkId: undefined,
            broadcastOverride: false,
            txSerialize: '',
            networkFee: 0,
            systemFee: 0
        },
    ) {
        if (this.neon.currentWalletChainType === 'Neo3') {
            this.isNeo3 = true;
        }
    }

    async ngOnInit() {
        this.network = this.isNeo3 ? this.global.n3Network : this.global.n2Network;
        const wallet = this.neon.wallet;
        this.fromName = wallet.name;
        this.rateCurrency = this.assetState.rateCurrency;
        for(const key in this.data) {
            if(this.data[key] !== '' && key !== 'txSerialize') {
                this.datajson[key] = this.data[key];
            }
        }
        this.getSymbol();
        this.getAssetRate();
    }

    private async getSymbol() {
        if(this.data.asset === NEO) {
            this.symbol = 'NEO'
            return
        }
        if(this.data.asset === GAS) {
            this.symbol = 'GAS'
            return
        }
        if(this.data.symbol === '') {
            const symbols = (await this.util.getAssetSymbols([this.data.asset], this.neon.currentWalletChainType));
            this.symbol = symbols[0];
        } else {
            this.symbol = this.data.symbol;
        }
    }

    public async getAssetRate() {
        const assetId = this.isNeo3 ? GAS3_CONTRACT : GAS;
        this.totalFee = bignumber(this.data.fee).add(this.data.systemFee || 0).add(this.data.networkFee || 0);
        this.assetState.getAssetRate('GAS', assetId).then(rate => {
            const gasPrice = rate || 0;
            this.feeMoney = new BigNumber(this.data.fee).times(gasPrice).toFixed();
            this.systemFeeMoney = new BigNumber(this.data.systemFee).times(gasPrice).toFixed();
            this.networkFeeMoney = new BigNumber(this.data.networkFee).times(gasPrice).toFixed();
            if (this.symbol === 'GAS') {
                this.money = new BigNumber(this.data.amount).times(gasPrice).toFixed();
                this.totalMoney = bignumber(this.feeMoney).add(this.systemFeeMoney).add(this.networkFeeMoney).add(this.money);
            } else {
                this.assetState.getAssetRate(this.symbol, this.data.asset).then(assetRate => {
                    this.money = new BigNumber(this.data.amount).times(assetRate || 0).toFixed();
                    this.totalMoney = bignumber(this.feeMoney).add(this.systemFeeMoney).add(this.networkFeeMoney).add(this.money);
                })
            }
        })
    }

    public editFee() {
        this.dialog.open(PopupEditFeeDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                fee: this.data.fee
            }
        }).afterClosed().subscribe(res => {
            if (res !== false) {
                this.data.fee = res;
                this.datajson.fee = res;
                const assetId = this.isNeo3 ? GAS3_CONTRACT : GAS;
                this.assetState.getAssetRate('GAS', assetId).then(rate => {
                    this.feeMoney = new BigNumber(this.data.fee).times(rate || 0).toFixed();
                    this.totalFee = bignumber(this.data.fee).add(this.data.systemFee || 0).add(this.data.networkFee || 0);
                    this.totalMoney = bignumber(this.feeMoney).add(this.systemFeeMoney).add(this.networkFeeMoney).add(this.money);
                });
            }
        })
    }

    public confirm() {
        this.dialogRef.close(this.data.fee);
    }

    public exit() {
        this.dialogRef.close(false);
    }

    public getAddressSub(address: string) {
        return `${address.substr(0, 3)}...${address.substr(address.length - 4, address.length - 1)} `
    }
}
