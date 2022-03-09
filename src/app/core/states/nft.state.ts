import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { Observable } from 'rxjs';
import { GlobalService } from '../services/global.service';
import { NftAsset } from '@/models/models';
import { AssetState } from './asset.state';

@Injectable()
export class NftState {
    constructor(
        private http: HttpService,
        private global: GlobalService,
        private asset: AssetState
    ) {}

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

    public async searchNft(q: string): Promise<NftAsset> {
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'getcontractstate',
            params: [q],
        };
        const res = await this.http
            .rpcPost(this.global.n3Network.rpcUrl, data)
            .toPromise();
        if ((res?.manifest?.supportedstandards || []).includes('NEP-11')) {
            const symbol = await this.asset
                .getAssetSymbol(res?.hash)
                .toPromise();
            const target: NftAsset = {
                name: res?.manifest.name,
                contract: res?.hash,
                symbol,
            };
            return target;
        } else {
            throw null;
        }
    }
}
