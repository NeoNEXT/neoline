import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import { Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { NeonService } from '../services/neon.service';
import { TX_LIST_PAGE_SIZE, NEO3_HOST, NEO3_CONTRACT, GAS3_CONTRACT } from '@popup/_lib';

@Injectable()
export class TransactionState {
    public txSource = new Subject();
    public txSub$ = this.txSource.asObservable();

    constructor(
        private http: HttpService,
        private global: GlobalService,
        private neonService: NeonService
    ) {}

    public pushTxSource() {
        this.txSource.next('new');
    }

    public fetchTx(
        address: string,
        page: number,
        asset: string,
        maxId: number = -1
    ): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3TokenTxs(address, asset, maxId);
        }
        let url =
            `${this.global.apiDomain}/v1/neo2/transactions/${address}/${asset}` +
            `?count=10`;
        if (maxId !== -1) {
            url += `&max_id=${maxId - 1}`;
        }
        return this.http.get(url).pipe(
            map((res) => {
                return res || [];
            })
        );
    }

    public getAllTx(address: string, maxId: number = -1): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3AllTxs(address, maxId);
        }
        let url =
            `${this.global.apiDomain}/v1/neo2/address/transactions/all?` +
            `address=${address}&count=10`;
        if (maxId !== -1) {
            url += `&max_id=${maxId - 1}`;
        }
        return this.http.get(url).pipe(
            map((res) => {
                return res || [];
            })
        );
    }

    getTxDetail(
        txid: string,
        address: string,
        assetId: string
    ): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3TxDetail(address, assetId, txid);
        }
        return this.http
            .get(`${this.global.apiDomain}/v1/neo2/transaction/${txid}`)
            .pipe(
                map((res) => {
                    return res || {};
                })
            );
    }

    //#region neo3
    /**
     * 格式化neo3 接口返回数据，字段名 contract => asset_id
     * @param data 接口数据
     */
    formatResponseData(data: any[]) {
        return data && data.map((item) => {
            item.asset_id = item.contract;
            item.value = item.amount;
            item.from = [item.from];
            item.to = [item.to];
            item.block_time /= 1000;
            if (item.contract === NEO3_CONTRACT) {
                item.symbol = 'NEO';
            }
            if (item.contract === GAS3_CONTRACT) {
                item.symbol = 'GAS';
            }
            return item;
        });
    }
    /**
     * 获取某资产的交易列表
     * @param address 地址
     * @param assetId 资产id
     * @param maxId maxid
     */
    fetchNeo3TokenTxs(
        address: string,
        assetId: string,
        maxId?: number
    ): Observable<any> {
        let req = `?address=${address}&contract=${assetId}&count=${TX_LIST_PAGE_SIZE}`;
        if (maxId !== -1) {
            req += `&max_id=${maxId - 1}`;
        }
        return this.http
            .get(`${NEO3_HOST}/neo3/address/transactions${req}`)
            .pipe(
                map((res) => {
                    return this.formatResponseData(res);
                })
            );
    }

    /**
     * 获取所有交易列表
     * @param address 地址
     * @param maxId maxid
     */
    fetchNeo3AllTxs(address: string, maxId?: number): Observable<any> {
        let req = `?address=${address}&count=${TX_LIST_PAGE_SIZE}`;
        if (maxId !== -1) {
            req += `&max_id=${maxId - 1}`;
        }
        return this.http
            .get(`${NEO3_HOST}/neo3/address/transactions${req}`)
            .pipe(
                map((res) => {
                    return this.formatResponseData(res);
                })
            );
    }

    /**
     * 获取交易详情
     * @param address 地址
     * @param assetId 资产id
     * @param txid 交易id
     */
    fetchNeo3TxDetail(
        address: string,
        assetId: string,
        txid: string
    ): Observable<any> {
        return this.http
            .get(`${NEO3_HOST}/neo3/transaction/${address}/${assetId}/${txid}`)
            .pipe(
                map((res) => {
                    return res || {};
                })
            );
    }

    /**
     * 判断交易是否被确认
     * @param hashes 交易id 数组
     */
    fetchNeo3TransactionValid(hashes: string[]): Observable<any> {
        return this.http.post(`${NEO3_HOST}/neo3/hash_valid`, hashes);
    }
    //#endregion
}
