import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class NftState {
    nftUrl = 'http://47.110.14.167:8085';

    constructor(private http: HttpService) {}

    getNfts(address: string): Observable<any> {
        // address = 'NUN147kJhy5iMmswWdi738PJpNBrgtm4j8';
        return this.http.get(
            `${this.nftUrl}/v1/neo3/address/nfts?address=${address}`
        );
    }

    getNftTokens(address: string, contract: string): Observable<any> {
        // address = 'NUN147kJhy5iMmswWdi738PJpNBrgtm4j8';
        // contract = '0xb137c83610d3f0331a48d8d6283864120b4f23a1';
        return this.http.get(
            `${this.nftUrl}/v1/neo3/address/nfttokens?address=${address}&contract=${contract}`
        );
    }

    getNftTransactions(
        address: string,
        contract: string,
        maxId?: number
    ): Observable<any> {
        // address = 'NUN147kJhy5iMmswWdi738PJpNBrgtm4j8';
        // contract = '0xb137c83610d3f0331a48d8d6283864120b4f23a1';
        const count = 10;
        let url = `${this.nftUrl}/v1/neo3/address/nft/transactions?address=${address}&contract=${contract}&count=${count}`;
        if (maxId !== -1) {
            url += `&max_id=${maxId}`;
        }
        return this.http.get(url);
    }
}
