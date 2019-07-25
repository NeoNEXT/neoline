import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService, NeonService, ChromeService } from '@/app/core';
import { Transaction, TransactionInput, InvocationTransaction } from '@cityofzion/neon-core/lib/tx';
import { wallet, tx, sc, u } from '@cityofzion/neon-core';
import { MatDialog } from '@angular/material';
import { PwdDialog } from '@/app/transfer/+pwd/pwd.dialog';
import { HttpClient } from '@angular/common/http';
import { ERRORS, DeployArgs, GAS, requestTarget } from '@/models/dapi';
import { generateDeployScript } from '@cityofzion/neon-core/lib/sc';
import { Observable } from 'rxjs';
import { UTXO } from '@/models/models';
import { map } from 'rxjs/operators';

@Component({
    templateUrl: 'deploy.component.html',
    styleUrls: ['deploy.component.scss']
})
export class PopupNoticeDeployComponent implements OnInit {
    public pramsData: any;
    public tx: Transaction;

    public broadcastOverride = null;
    public loading = false;
    public loadingMsg: string;
    private messageID = 0;

    constructor(
        private aRoute: ActivatedRoute,
        private router: Router,
        private global: GlobalService,
        private neon: NeonService,
        private dialog: MatDialog,
        private http: HttpClient,
        private chrome: ChromeService
    ) { }

    ngOnInit(): void {
        this.aRoute.queryParams.subscribe((params: any) => {
            this.pramsData = params;
            this.messageID = params.messageID;
            if (params.network !== undefined) {
                if (params.network === 'MainNet') {
                    this.global.modifyNet('MainNet');
                } else {
                    this.global.modifyNet('TestNet');
                }
                this.broadcastOverride = this.pramsData.broadcastOverride || false;
                setTimeout(() => {
                    this.pwdDialog();
                }, 0);
            } else {
                return;
            }
        });
        window.onbeforeunload = () => {
            this.chrome.windowCallback({
                error: ERRORS.CANCELLED,
                return: requestTarget.Deploy,
                ID: this.messageID
            });
        };
    }

    private pwdDialog() {
        this.dialog.open(PwdDialog, {
            disableClose: true
        }).afterClosed().subscribe((pwd) => {
            if (pwd && pwd.length) {
                this.global.log('start transfer with pwd');
                this.createTxForNEP5().then(res => {
                    this.resolveSign(res, pwd);
                }).catch(err => {
                    this.chrome.windowCallback({
                        error: ERRORS.MALFORMED_INPUT,
                        return: requestTarget.Deploy,
                        ID: this.messageID
                    });
                    window.close();
                });
            } else {
                this.global.log('cancel pay');
            }
        });
    }

    private resolveSign(transaction: Transaction, pwd: string) {
        this.loading = true;
        this.loadingMsg = 'Wait';
        if (transaction === null) {
            return;
        }
        this.neon.wallet.accounts[0].decrypt(pwd).then((acc) => {
            try {
                transaction.sign(acc);
            } catch (error) {
                console.log(error);
            }
            this.tx = transaction;
            if (this.broadcastOverride === true) {
                this.loading = false;
                this.loadingMsg = '';
                this.chrome.windowCallback({
                    data: {
                        txid: transaction.hash,
                        signedTX: this.tx.serialize(true)
                    },
                    return: requestTarget.Deploy,
                    ID: this.messageID
                });
            } else {
                this.resolveSend(this.tx);
            }
        }).catch((err) => {
            this.loading = false;
            this.loadingMsg = '';
            this.global.snackBarTip('verifyFailed', err);
            this.dialog.open(PwdDialog, {
                disableClose: true
            }).afterClosed().subscribe((pwdText) => {
                if (pwdText && pwdText.length) {
                    this.global.log('start transfer with pwd');
                    this.resolveSign(transaction, pwdText);
                } else {
                    this.global.log('cancel pay');
                }
            });
        });
    }

    private resolveSend(transaction: Transaction) {
        return this.http.post(`${this.global.apiDomain}/v1/transactions/transfer`, {
            signature_transaction: transaction.serialize(true)
        }).subscribe(async (res: any) => {
            this.loading = false;
            this.loadingMsg = '';
            if (!res.bool_status) {
                this.chrome.windowCallback({
                    error: ERRORS.RPC_ERROR,
                    return: requestTarget.Deploy,
                    ID: this.messageID
                });
                this.global.snackBarTip('transferFailed');
            } else {
                this.chrome.windowCallback({
                    data: {
                        txid: transaction.hash,
                        nodeURL: `${this.global.apiDomain}`
                    },
                    return: requestTarget.Deploy,
                    ID: this.messageID
                });
                const setData = {};
                setData[`${this.pramsData.network}TxArr`] =  await this.chrome.getLocalStorage(`${this.pramsData.network}TxArr`) || [];
                setData[`${this.pramsData.network}TxArr`].push('0x' + transaction.hash);
                this.chrome.setLocalStorage(setData);
                this.router.navigate([{
                    outlets: {
                        transfer: ['transfer', 'result']
                    }
                }]);
            }
        }, err => {
            this.loading = false;
            this.loadingMsg = '';
            this.chrome.windowCallback({
                error: ERRORS.RPC_ERROR,
                return: requestTarget.Deploy,
                ID: this.messageID
            });
            this.global.snackBarTip('transferFailed', err);
        });
    }

    private createTxForNEP5(): Promise<Transaction> {
        return new Promise(async (resolve, reject) => {
            const fromAddress = this.neon.wallet.accounts[0].address;
            let newTx = new tx.InvocationTransaction();
            const temp = {};
            for (const key in this.pramsData) {
                if (this.pramsData.hasOwnProperty(key)) {
                    temp[key] = this.pramsData[key];
                }
            }
            temp['script'] = this.pramsData.code;
            temp['needsStorage'] = this.pramsData.needsStorage === 'true' ? true : false;
            try {
                newTx.script = generateDeployScript(temp as any).str;
            } catch (error) {
                reject(error);
            }
            try {
                newTx = await this.addFee(fromAddress, newTx, parseFloat(this.pramsData.networkFee));
            } catch (error) {
                console.log(error);
                this.chrome.windowCallback({
                    error: ERRORS.INSUFFICIENT_FUNDS,
                    return: requestTarget.Deploy,
                    ID: this.messageID
                });
                window.close();
            }
            const uniqTag = `from NEOLine at ${new Date().getTime()}`;
            newTx.addAttribute(tx.TxAttrUsage.Remark1, u.reverseHex(u.str2hexstring(uniqTag)));
            resolve(newTx);
        });
    }

    private getBalance(address: string, asset: string): Observable<UTXO[]> {
        return this.http.get(`${this.global.apiDomain}/v1/transactions/getutxoes?address=${address}&asset_id=${asset}`).pipe(map((res) => {
            return (res as any).result as UTXO[];
        }));
    }

    public addFee(from: string, newTx: InvocationTransaction, fee: number = 0): Promise<InvocationTransaction> {
        return new Promise((resolve, reject) => {
            this.getBalance(from, GAS).subscribe(res => {
                let curr = 0.0;
                for (const item of res) {
                    curr += parseFloat(item.value) || 0;
                    newTx.inputs.push(new TransactionInput({
                        prevIndex: item.n,
                        prevHash: item.txid.startsWith('0x') && item.txid.length === 66 ?
                            item.txid.substring(2) : item.txid
                    }));
                    if (curr >= fee) {
                        break;
                    }
                }
                const payback = curr - fee;
                if (payback < 0) {
                    reject('no enough GAS to fee');
                }
                if (payback > 0) {
                    const fromScript = wallet.getScriptHashFromAddress(from);
                    let gasAssetId = res[0].asset_id;
                    if (gasAssetId.startsWith('0x') && gasAssetId.length === 66) {
                        gasAssetId = gasAssetId.substring(2);
                    }
                    newTx.addOutput({ assetId: gasAssetId, value: curr - fee, scriptHash: fromScript });
                }
                resolve(newTx);
            });
        });
    }
}
