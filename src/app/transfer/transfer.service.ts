import { Injectable } from '@angular/core';
import { NeonService, HttpService, GlobalService } from '../core';
import { Transaction } from '@cityofzion/neon-core/lib/tx';
import { Observable, of } from 'rxjs';
import { map, delay } from 'rxjs/operators';
import { UTXO } from '@/models/models';

@Injectable()
export class TransferService {
    constructor(
        private neon: NeonService,
        private http: HttpService,
        private global: GlobalService
    ) {}
    public create(from: string, to: string, asset: string, amount: number): Observable<Transaction> {
        if (this.neon.isAsset(asset)) {
            return this.fetchBalance(from, asset).pipe(map((balance) => {
                return this.neon.createTx(from, to, balance, amount);
            }));
        } else {
            return of(this.neon.createTxForNEP5(from, to, asset, amount));
        }
    }
    private fetchBalance(address: string, asset: string): Observable<UTXO[]> {
        return this.http.get(`${this.global.apiDomain}/v1/transactions/getutxoes?address=${address}&asset_id=${asset}`).pipe(map((res) => {
            return res as UTXO[];
        }));
    }
}
