import { Injectable } from '@angular/core';
import { HttpService } from './http.service';
import { GlobalService } from './global.service';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable()
export class HomeService {
    loading = false;
    showClaim = false;
    claimNumber = 0;
    claimGasHash: string;
    claimTxTime;
    constructor(private http: HttpService, private global: GlobalService) {}

    getN3RawTransaction(txHash: string) {
        const data = {
            jsonrpc: '2.0',
            id: 1234,
            method: 'getrawtransaction',
            params: [txHash, true],
        };
        const rpcHost = this.global.n3Network.rpcUrl;
        return this.http.rpcPost(rpcHost, data).toPromise();
    }

    getRpcUrlMessage(rpcUrl: string): Observable<any> {
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'getversion',
            params: [],
        };
        return this.http.rpcPost(rpcUrl, data).pipe(
            map((res) => {
                return res;
            })
        );
    }
}
