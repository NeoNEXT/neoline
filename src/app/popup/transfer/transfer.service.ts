import { Injectable } from '@angular/core';
import { Transaction, TransactionInput } from '@cityofzion/neon-core/lib/tx';
import { Transaction as Transaction3 } from '@cityofzion/neon-core-neo3/lib/tx';
import { Observable, of } from 'rxjs';
import { map, delay } from 'rxjs/operators';
import { UTXO, GAS } from '@/models/models';
import { wallet } from '@cityofzion/neon-core';
import { NeonService, HttpService, GlobalService, AssetState } from '@/app/core';
import { Neo3TransferService } from './neo3-transfer.service';

@Injectable()
export class TransferService {
    constructor(
        private neon: NeonService,
        private http: HttpService,
        private global: GlobalService,
        private neo3TransferService: Neo3TransferService,
        private assetState: AssetState
    ) { }
    public create(from: string, to: string, asset: string, amount: string, fee: number = 0, decimals: number = 0,
        broadcastOverride: boolean = false, nftTokenId?: string): Observable<Transaction | Transaction3> {
        if (this.neon.currentWalletChainType === 'Neo3') {
            return new Observable(observer => {
                this.neo3TransferService.createNeo3Tx({addressFrom: from, addressTo: to, tokenScriptHash: asset, amount, networkFee: fee, decimals, nftTokenId}).subscribe(tx => {
                        observer.next(tx);
                        observer.complete();
                }, error => {
                    observer.error(error.msg);
                    observer.complete();
                })
            });
        }
        if (this.neon.isAsset(asset)) {
            return new Observable(observer => {
                this.assetState.getNeo2Utxo(from, asset).subscribe((balance) => {
                    try {
                        const newTx = this.neon.createTx(from, to, balance, amount, fee);
                        if (fee > 0 && asset !== GAS) {
                            this.addFee(from, newTx, fee).subscribe(res => {
                                observer.next(res);
                                observer.complete();
                            }, error => {
                                observer.error(error);
                            });
                        } else {
                            observer.next(newTx);
                            observer.complete();
                        }
                    } catch (error) {
                        observer.error(error.message);
                    }
                });
            });
        } else {
            return new Observable(observer => {
                const newTx = this.neon.createTxForNEP5(from, to, asset, amount, decimals, broadcastOverride);
                if (fee > 0 && asset !== GAS) {
                    this.addFee(from, newTx, fee).subscribe(res => {
                        observer.next(res);
                        observer.complete();
                    }, error => {
                        observer.error(error);
                    });
                } else {
                    observer.next(newTx);
                    observer.complete();
                }
            });
        }
    }

    public addFee(from: string, newTx: Transaction, fee: number = 0): Observable<Transaction> {
        return new Observable(observer => {
            this.assetState.getNeo2Utxo(from, GAS).subscribe(res => {
                let curr = 0.0;
                for (const item of res) {
                    curr = this.global.mathAdd(curr, parseFloat(item.value) || 0);
                    newTx.inputs.push(new TransactionInput({
                        prevIndex: item.n,
                        prevHash: item.txid.startsWith('0x') && item.txid.length === 66 ?
                            item.txid.substring(2) : item.txid
                    }));
                    if (curr >= fee) {
                        break;
                    }
                }
                const payback = this.global.mathSub(curr, fee);
                if (payback < 0) {
                    observer.error('no enough GAS to fee');
                }
                if (payback > 0) {
                    const fromScript = wallet.getScriptHashFromAddress(from);
                    let gasAssetId = res[0].asset_id;
                    if (gasAssetId.startsWith('0x') && gasAssetId.length === 66) {
                        gasAssetId = gasAssetId.substring(2);
                    }
                    newTx.addOutput({ assetId: gasAssetId, value: this.global.mathSub(curr, fee), scriptHash: fromScript });
                }
                observer.next(newTx);
                observer.complete();
            });
        });
    }
}
