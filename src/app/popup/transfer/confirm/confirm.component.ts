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
import { PopupInputDialogComponent, PopupEditFeeDialogComponent } from '../../_dialogs';

@Component({
    templateUrl: 'confirm.component.html',
    styleUrls: ['confirm.component.scss']
})
export class PopupTransferConfirmComponent implements OnInit {
    public logoUrlArr = [];
    public net = '';
    public fromName: string = '';
    public assetImageUrl: string = '';
    public datajson: any = {};
    public symbol = ''
    public money = '';
    public feeMoney = '0';
    public totalMoney = '';
    public rateCurrency = ''
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
        },
    ) { }

    async ngOnInit() {
        const wallet = this.neon.wallet;
        this.fromName = wallet.name;
        this.rateCurrency = this.assetState.rateCurrency
        this.assetImageUrl = await this.assetState.getAssetImageFromAssetId(this.data.asset);
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
            this.symbol = (await this.assetState.getNep5Detail(this.data.asset).toPromise()).symbol;
        } else {
            this.symbol = this.data.symbol;
        }
    }

    public async getAssetRate() {
        if(Number( this.data.fee) > 0) {
            this.getMoney('GAS', Number(this.data.fee)).then(res => {
                this.feeMoney = res;
                if(this.money !== '') {
                    this.totalMoney = this.global.mathAdd(Number(this.feeMoney), Number(this.money)).toString();
                } else {
                    this.totalMoney = this.feeMoney;
                }
            })
        }
        this.getMoney(this.symbol, Number(this.data.amount)).then(res => {
            this.money = res;
            if(this.feeMoney !== '' && Number( this.data.fee) > 0) {
                this.totalMoney = this.global.mathAdd(Number(this.feeMoney), Number(this.money)).toString();
            } else {
                this.totalMoney = res;
            }
        })
    }

    public async getMoney(symbol: string, balance: number): Promise<string> {
        return new Promise((mResolve) => {
            this.assetState.getAssetRate(symbol).subscribe(rate => {
                if (symbol.toLowerCase() in rate) {
                    mResolve(this.global.mathmul(Number(rate[symbol.toLowerCase()]), Number(balance)).toString());
                } else {
                    mResolve('');
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
                if (res === 0) {
                    this.feeMoney = '0';
                } else {
                    this.assetState.getMoney('GAS', Number(this.data.fee)).then(feeMoney => {
                        this.feeMoney = feeMoney;
                        this.totalMoney = this.global.mathAdd(Number(this.feeMoney), Number(this.money)).toString();
                    });
                }
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
