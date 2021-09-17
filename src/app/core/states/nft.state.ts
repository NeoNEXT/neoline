import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { Observable } from 'rxjs';
import { GlobalService } from '../services/global.service';

@Injectable()
export class NftState {
    constructor(private http: HttpService, private global: GlobalService) {}

    getNfts(address: string): Observable<any> {
        return this.http.get(
            `${this.global.apiDomain}/v1/neo3/address/nfts?address=${address}`
        );
    }

    getNftTokens(address: string, contract: string): Observable<any> {
        return this.http.get(
            `${this.global.apiDomain}/v1/neo3/address/nfttokens?address=${address}&contract=${contract}`
        );
    }

    getNftTransactions(
        address: string,
        contract: string,
        maxId?: number
    ): Observable<any> {
        const count = 10;
        let url = `${this.global.apiDomain}/v1/neo3/address/nft/transactions?address=${address}&contract=${contract}&count=${count}`;
        if (maxId !== -1) {
            url += `&max_id=${maxId}`;
        }
        return this.http.get(url);
    }
}
