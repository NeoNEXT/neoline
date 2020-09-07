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
import { PopupInputDialogComponent } from '../../_dialogs';

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
        this.assetImageUrl = await this.assetState.getAssetImage(this.data.asset);
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
            this.symbol = (await this.assetState.getNep5Detail(this.data.asset).toPromise()).nep5.symbol;
        } else {
            this.symbol = this.data.symbol;
        }
    }

    public async getAssetRate() {
        if(Number( this.data.fee) > 0) {
            this.feeMoney = await this.getMoney('GAS', Number(this.data.fee))
        }
        const assetRate = await this.assetState.getAssetRate(this.symbol).toPromise();
        this.money = await this.getMoney(this.symbol, Number(this.data.amount));
        this.totalMoney = this.global.mathAdd(Number(this.feeMoney), Number(this.money)).toString();
    }

    public async getMoney(symbol: string, balance: number): Promise<string> {
        const rate = await this.assetState.getAssetRate(symbol).toPromise();
        if (symbol.toLowerCase() in rate) {
            return this.global.mathmul(Number(rate[symbol.toLowerCase()]), Number(balance)).toString();
        } else {
            return '';
        }
    }

    public editFee() {
        this.dialog.open(PopupInputDialogComponent, {
            panelClass: 'custom-dialog-panel',
            data: {
                type: 'number',
                title: 'editFee'
            }
        }).afterClosed().subscribe(async (inputStr: string) => {
            if(inputStr !== '' && inputStr !== null ) {
                let text = inputStr;
                const index = inputStr.indexOf('.')
                if(index >= 0) {
                    if(inputStr.length - index > 8) {
                        text = text.substring(0, index + 9);
                    }
                }
                this.data.fee = text;
                if(Number( this.data.fee) > 0) {
                    this.feeMoney = await this.getMoney('GAS', Number(this.data.fee))
                }
                this.totalMoney = this.global.mathAdd(Number(this.feeMoney), Number(this.money)).toString();

            }
        })
    }

    public confirm() {
        this.dialogRef.close(true);
    }

    public exit() {
        this.dialogRef.close(false);
    }

    public getAddressSub(address: string) {
        return `${address.substr(0, 3)}...${address.substr(address.length - 4, address.length - 1)} `
    }
}
