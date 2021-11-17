import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NeonService, ChromeService, GlobalService } from '@/app/core';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { NEO3_MAGIC_NUMBER } from '../../_lib';

@Component({
    templateUrl: './neo3-sign-transaction.component.html',
    styleUrls: ['./neo3-sign-transaction.component.scss'],
})
export class PopupNoticeNeo3SignTransactionComponent implements OnInit {
    public address: string;
    public net: string;
    public tx: Transaction;
    public txJson;
    public serializeTx: string;
    private messageID = 0;
    public magicNumber;

    constructor(
        private aRouter: ActivatedRoute,
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService
    ) {}

    ngOnInit() {
        this.address = this.neon.address;
        this.aRouter.queryParams.subscribe((params: any) => {
            this.messageID = params.messageID;
            this.txJson = JSON.parse(params.transaction);
            if (params?.magicNumber) {
                this.magicNumber = Number(params?.magicNumber);
            }
            try {
                this.tx = new Transaction(this.txJson);
                this.serializeTx = this.tx.serialize(false);
            } catch (error) {
                this.chrome.windowCallback({
                    error: {
                        ...ERRORS.MALFORMED_INPUT,
                        description: error?.message || error,
                    },
                    return: requestTargetN3.SignTransaction,
                    ID: this.messageID,
                });
                window.close();
            }
            window.onbeforeunload = () => {
                this.chrome.windowCallback({
                    error: ERRORS.CANCELLED,
                    return: requestTargetN3.SignTransaction,
                    ID: this.messageID,
                });
            };
            this.net = this.global.net;
        });
    }

    public cancel() {
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            return: requestTargetN3.SignTransaction,
            ID: this.messageID,
        });
        window.close();
    }

    public signature() {
        const wif =
            this.neon.WIFArr[
                this.neon.walletArr.findIndex(
                    (item) =>
                        item.accounts[0].address ===
                        this.neon.wallet.accounts[0].address
                )
            ];
        this.tx.sign(wif, this.magicNumber || NEO3_MAGIC_NUMBER[this.net]);
        this.chrome.windowCallback({
            return: requestTargetN3.SignTransaction,
            data: this.tx.export(),
            ID: this.messageID,
        });
        window.close();
    }
}
