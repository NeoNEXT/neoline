import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NeonService, ChromeService, GlobalService, LedgerService } from '@/app/core';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { RpcNetwork } from '../../_lib';
import { LedgerStatuses } from '../../_lib';
import { interval } from 'rxjs';

@Component({
    templateUrl: './neo3-sign-transaction.component.html',
    styleUrls: ['./neo3-sign-transaction.component.scss'],
})
export class PopupNoticeNeo3SignTransactionComponent implements OnInit {
    public address: string;
    public tx: Transaction;
    public txJson;
    public serializeTx: string;
    private messageID = 0;
    public magicNumber;

    public n3Network: RpcNetwork;
    getStatusInterval;
    loading = false;
    loadingMsg = '';

    constructor(
        private aRouter: ActivatedRoute,
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService,
        private ledger: LedgerService
    ) {
        this.n3Network = this.global.n3Network;
    }

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

    private sendMessage() {
        this.chrome.windowCallback({
            return: requestTargetN3.SignTransaction,
            data: this.tx.export(),
            ID: this.messageID,
        });
        window.close();
    }

    private getLedgerStatus() {
        this.ledger
            .getDeviceStatus(this.neon.currentWalletChainType)
            .then(async (res) => {
                this.loadingMsg = LedgerStatuses[res].msgNeo3 || LedgerStatuses[res].msg;
                if (LedgerStatuses[res] === LedgerStatuses.READY) {
                    this.getStatusInterval.unsubscribe();
                    this.loadingMsg = 'signTheTransaction';
                    this.ledger
                        .getLedgerSignedTx(
                            this.tx,
                            this.neon.wallet,
                            this.neon.currentWalletChainType,
                            this.global.n3Network.magicNumber
                        )
                        .then((tx) => {
                            this.loading = false;
                            this.loadingMsg = '';
                            this.tx = tx;
                            this.sendMessage();
                        })
                        .catch((error) => {
                            this.loading = false;
                            this.loadingMsg = '';
                            this.global.snackBarTip(
                                'TransactionDeniedByUser',
                                error
                            );
                        });
                }
            });
    }

    public getSignTx() {
        if (this.neon.wallet.accounts[0]?.extra?.ledgerSLIP44) {
            this.loading = true;
            this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
            this.getLedgerStatus();
            this.getStatusInterval = interval(5000).subscribe(() => {
                this.getLedgerStatus();
            });
            return;
        }
        const wif =
            this.neon.WIFArr[
                this.neon.walletArr.findIndex(
                    (item) =>
                        item.accounts[0].address ===
                        this.neon.wallet.accounts[0].address
                )
            ];
        this.tx.sign(wif, this.global.n3Network.magicNumber);
        this.sendMessage();
    }
}
