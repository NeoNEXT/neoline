import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { Observable } from 'rxjs';
import { GlobalService } from '../services/global.service';
import { map } from 'rxjs/operators';
import { hexstring2str, base642hex } from '@cityofzion/neon-core-neo3/lib/u';
import { NftAsset } from '@/models/models';

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

    public async searchNft(q: string): Promise<NftAsset> {
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'getcontractstate',
            params: [q],
        };
        const res = await this.http.rpcPost(this.global.Neo3RPCDomain, data).toPromise();
        if (res.result && res.result?.manifest?.supportedstandards.includes('NEP-11')) {
            const symbol = await this.getAssetSymbol(res.result.hash).toPromise();
            const target: NftAsset = {
                name: res.result.manifest.name,
                contract: res.result.hash,
                symbol
            }
            return target;
        } else {
            throw null;
        }
    }

    private getAssetSymbol(assetId: string): Observable<string> {
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'invokefunction',
            params: [assetId, 'symbol'],
        };
        return this.http.rpcPost(this.global.Neo3RPCDomain, data).pipe(
            map((res) => {
                let symbol = res.result.stack[0].value;
                if (res.result.stack) {
                    if (res.result.stack[0].type === 'ByteArray') {
                        symbol = hexstring2str(res.result.stack[0].value);
                    }
                    if (res.result.stack[0].type === 'ByteString') {
                        symbol = hexstring2str(base642hex(res.result.stack[0].value));
                    }
                }
                return symbol;
            })
        );
    }
}
