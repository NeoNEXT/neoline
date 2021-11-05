import {
    Component,
    OnInit,
    Inject
} from '@angular/core';
import {
    MatDialogRef, MAT_DIALOG_DATA, MatDialog,
} from '@angular/material/dialog';

import {
    ChromeService, AssetState, NeonService, GlobalService,
} from '@app/core';
import { NEO, GAS } from '@/models/models';
import { PopupEditFeeDialogComponent } from '../../_dialogs';
import { forkJoin } from 'rxjs';
import { bignumber } from 'mathjs';

@Component({
    templateUrl: 'confirm.component.html',
    styleUrls: ['confirm.component.scss']
})
export class PopupTransferConfirmComponent implements OnInit {
    public logoUrlArr = [];
    public net = '';
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
            network: string,
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
            network: '',
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
        const wallet = this.neon.wallet;
        this.fromName = wallet.name;
        this.rateCurrency = this.assetState.rateCurrency;
        for(const key in this.data) {
            if(this.data[key] !== '' && key !== 'txSerialize') {
                this.datajson[key] = this.data[key];
            }
        }
        this.net = this.global.net;
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
            this.symbol = (await this.assetState.getAssetSymbol(this.data.asset).toPromise());
        } else {
            this.symbol = this.data.symbol;
        }
    }

    public async getAssetRate() {
        const getFeeMoney = this.getMoney('GAS', Number(this.data.fee));
        const getTransferMoney = this.getMoney(this.symbol, Number(this.data.amount));
        const getSystemFeeMoney = this.getMoney('GAS', this.data.systemFee || 0);
        const getNetworkFeeMoney = this.getMoney('GAS', this.data.networkFee || 0);
        this.totalFee = bignumber(this.data.fee).add(this.data.systemFee || 0).add(this.data.networkFee || 0);
        forkJoin([getFeeMoney, getSystemFeeMoney, getNetworkFeeMoney, getTransferMoney]).subscribe(res => {
            this.feeMoney = res[0];
            this.systemFeeMoney = res[1];
            this.networkFeeMoney = res[2];
            this.money = res[3];
            this.totalMoney = bignumber(this.feeMoney).add(this.systemFeeMoney).add(this.networkFeeMoney).add(this.money);
        });
    }

    public async getMoney(symbol: string, balance: number): Promise<string> {
        return new Promise((mResolve) => {
            if (balance == 0) {
                mResolve('0');
            }
            this.assetState.getAssetRate(symbol).subscribe(rate => {
                if (symbol.toLowerCase() in rate) {
                    mResolve(this.global.mathmul(Number(rate[symbol.toLowerCase()]), Number(balance)).toString());
                } else {
                    mResolve('0');
                }
            });
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
                this.assetState.getMoney('GAS', Number(this.data.fee)).then(feeMoney => {
                    this.feeMoney = feeMoney;
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
