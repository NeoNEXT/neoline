import { Injectable } from '@angular/core';
import { NeonService, HttpService, GlobalService, AssetState } from '../core';
import { Transaction, TransactionInput } from '@cityofzion/neon-core/lib/tx';
import { Observable, of } from 'rxjs';
import { map, delay } from 'rxjs/operators';
import { UTXO, GAS } from '@/models/models';
import { wallet } from '@cityofzion/neon-core';

@Injectable()
export class TransferService {
    constructor(
        private neon: NeonService,
        private http: HttpService,
        private global: GlobalService,
    ) { }
    public create(from: string, to: string, asset: string, amount: string, fee: number = 0, decimals: number = 0,
        broadcastOverride: boolean = false): Observable<Transaction> {
        if (this.neon.isAsset(asset)) {
            return new Observable(observer => {
                this.getBalance(from, asset).subscribe((balance) => {
                    const newTx = this.neon.createTx(from, to, balance, amount, fee);
                    if (fee > 0 && asset !== GAS) {
                        this.addFee(from, newTx, fee).subscribe(res => {
                            observer.next(res);
                            observer.complete();
                        });
                    } else {
                        observer.next(newTx);
                        observer.complete();
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
            this.getBalance(from, GAS).subscribe(res => {
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

    private getBalance(address: string, asset: string): Observable<UTXO[]> {
        return this.http.get(`${this.global.apiGoDomain}/v1/neo2/address/utxo?address=${address}&asset_id=${asset}`).pipe(map((res) => {
            return res as UTXO[];
        }));
    }
}
