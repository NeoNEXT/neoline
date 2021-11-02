import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import { Subject, Observable, of, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { NeonService } from '../services/neon.service';
import { NEO3_CONTRACT, GAS3_CONTRACT, ChainType } from '@popup/_lib';
import { Transaction, Asset, NEO, GAS } from '@/models/models';
import { AssetState } from './asset.state';
import BigNumber from 'bignumber.js';
import { hexstring2str, base642hex } from '@cityofzion/neon-core-neo3/lib/u';

@Injectable()
export class TransactionState {
    private txSource = new Subject();
    public txSub$ = this.txSource.asObservable();
    constructor(
        private http: HttpService,
        private global: GlobalService,
        private neonService: NeonService,
        private assetState: AssetState
    ) {}

    public pushTxSource() {
        this.txSource.next('new');
    }

    rpcSendRawTransaction(tx) {
        const data = {
            jsonrpc: '2.0',
            id: 1234,
            method: 'sendrawtransaction',
            params: [tx],
        };
        return this.http.rpcPost(this.global.n2Network.rpcUrl, data).toPromise();
    }

    async getAllTxs(address: string): Promise<Transaction[]> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.getN3AllTxs(address);
        }
        return this.getNeo2AllTxs(address);
    }

    async getAssetTxs(address: string, asset: string): Promise<Transaction[]> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.getN3AssetTxs(address, asset);
        }
        return this.getNeo2AssetTxs(address, asset);
    }

    getNeo2TxDetail(txid: string): Observable<any> {
        const data = {
            jsonrpc: '2.0',
            method: 'getrawtransaction',
            params: [txid, true],
            id: 1,
        };
        return this.http.rpcPost(this.global.n2Network.rpcUrl, data).pipe(
            map((res) => {
                return this.handleNeo2TxDetailResponse(res);
            })
        );
    }

    getTxsValid(txids: string[], chainType: ChainType): Observable<string[]> {
        const reqs = [];
        // neo2
        if (chainType === 'Neo2') {
            txids.forEach((txid) => {
                const data = {
                    jsonrpc: '2.0',
                    method: 'getrawtransaction',
                    params: [txid, 1],
                    id: 1,
                };
                const req = this.http.rpcPost(this.global.n2Network.rpcUrl, data);
                reqs.push(req);
            })
            return forkJoin(reqs).pipe(map((res: any[]) => {
                const result = [];
                res.forEach(item => {
                    console.log(item);
                    if (item?.blocktime) {
                        result.push(item.txid);
                    }
                })
                return result;
            }));
        }
        // neo3
        txids.forEach((txid) => {
            const data = {
                jsonrpc: '2.0',
                method: 'getrawtransaction',
                params: [txid, true],
                id: 1,
            };
            const req = this.http.rpcPost(this.global.n3Network.rpcUrl, data);
            reqs.push(req);
        })
        return forkJoin(reqs).pipe(map((res: any[]) => {
            const result = [];
            res.forEach(item => {
                console.log(item);
                if (item?.blocktime) {
                    result.push(item.hash);
                }
            })
            return result;
        }));
    }

    //#region private function
    private async getNeo2AllTxs(address: string): Promise<Transaction[]> {
        const time = Math.floor(new Date().getTime() / 1000) - 30 * 24 * 3600;
        const data = {
            jsonrpc: '2.0',
            method: 'getnep5transfers',
            params: [address, time],
            id: 1,
        };
        let nep5Res = await this.http
            .rpcPost(this.global.n2Network.rpcUrl, data)
            .toPromise();
        let neoRes = await this.http
            .rpcPost(this.global.n2Network.rpcUrl, {
                ...data,
                method: 'getutxotransfers',
                params: [address, 'NEO', time],
            })
            .toPromise();
        let gasRes = await this.http
            .rpcPost(this.global.n2Network.rpcUrl, {
                ...data,
                method: 'getutxotransfers',
                params: [address, 'GAS', time],
            })
            .toPromise();
        neoRes = this.handleNeo2NativeTxResponse(neoRes);
        gasRes = this.handleNeo2NativeTxResponse(gasRes);
        nep5Res = await this.handleNeo2TxResponse(nep5Res);
        let n2Res = neoRes.concat(gasRes).concat(nep5Res);
        n2Res = n2Res.sort((a, b) => b.block_time - a.block_time);
        return n2Res;
    }
    private async getN3AllTxs(address: string): Promise<Transaction[]> {
        const time = Math.floor(new Date().getTime() / 1000) - 30 * 24 * 3600;
        const data = {
            jsonrpc: '2.0',
            method: 'getnep17transfers',
            params: [address, time],
            id: 1,
        };
        let n3Res = await this.http
            .rpcPost(this.global.n3Network.rpcUrl, data)
            .toPromise();
        n3Res = await this.handleN3TxResponse(n3Res);
        n3Res = n3Res.sort((a, b) => b.block_time - a.block_time);
        return n3Res;
    }
    private async getNeo2AssetTxs(
        address: string,
        asset: string
    ): Promise<Transaction[]> {
        const time = Math.floor(new Date().getTime() / 1000) - 30 * 24 * 3600;
        const data = {
            jsonrpc: '2.0',
            method: 'getnep5transfers',
            params: [address, time],
            id: 1,
        };
        if (asset === NEO) {
            data.method = 'getutxotransfers';
            data.params = [address, 'NEO', time];
        }
        if (asset === GAS) {
            data.method = 'getutxotransfers';
            data.params = [address, 'GAS', time];
        }
        let res = await this.http
            .rpcPost(this.global.n2Network.rpcUrl, data)
            .toPromise();
        if (asset === NEO || asset === GAS) {
            res = this.handleNeo2NativeTxResponse(res);
        } else {
            res = res.filter((item) => item.asset_id === asset);
            res = this.handleNeo2TxResponse(res);
        }
        res = res.sort((a, b) => b.block_time - a.block_time);
        return res;
    }
    private async getN3AssetTxs(
        address: string,
        asset: string
    ): Promise<Transaction[]> {
        const res = await this.getAllTxs(address);
        return res.filter((item) => item.asset_id === asset);
    }
    private handleNeo2NativeTxResponse(data): Transaction[] {
        const target: Transaction[] = [];
        data.sent.forEach(({ asset, asset_hash, transactions }) => {
            transactions.forEach(({ timestamp, txid, amount, block_index }) => {
                target.push({
                    value: `-${amount}`,
                    txid,
                    symbol: asset,
                    asset_id: asset_hash,
                    block_time: timestamp,
                    type: 'sent',
                    id: block_index,
                });
            });
        });
        data.received.forEach(({ asset, asset_hash, transactions }) => {
            transactions.forEach(({ timestamp, txid, amount, block_index }) => {
                target.push({
                    value: amount,
                    txid,
                    symbol: asset,
                    asset_id: asset_hash,
                    block_time: timestamp,
                    type: 'received',
                    id: block_index,
                });
            });
        });
        return target;
    }
    private handleNeo2TxResponse(data): Promise<Transaction[]> {
        const result: Transaction[] = [];
        data.sent.forEach(
            ({
                amount,
                asset_hash,
                timestamp,
                transfer_address,
                tx_hash,
                block_index,
            }) => {
                result.push({
                    asset_id: asset_hash,
                    value: `-${amount}`,
                    block_time: timestamp,
                    txid: tx_hash,
                    from: [data.address],
                    to: [transfer_address],
                    type: 'sent',
                    id: block_index,
                });
            }
        );
        data.received.forEach(
            ({
                amount,
                asset_hash,
                timestamp,
                transfer_address,
                tx_hash,
                block_index,
            }) => {
                result.push({
                    asset_id: asset_hash,
                    value: amount,
                    block_time: timestamp,
                    txid: tx_hash,
                    from: [transfer_address],
                    to: [data.address],
                    type: 'received',
                    id: block_index,
                });
            }
        );
        // return of(result).toPromise();
        return this.getNeo2AssetSymbolAndDecimal(result);
    }
    private handleN3TxResponse(data): Promise<Transaction[]> {
        const result: Transaction[] = [];
        data.sent.forEach(
            ({
                timestamp,
                assethash,
                transferaddress,
                amount,
                txhash,
                blockindex,
            }) => {
                const txItem: Transaction = {
                    block_time: Math.floor(timestamp / 1000),
                    asset_id: assethash,
                    from: [data.address],
                    to: [transferaddress],
                    value: `-${amount}`,
                    txid: txhash,
                    type: 'sent',
                    id: blockindex,
                };
                if (assethash === NEO3_CONTRACT) {
                    txItem.symbol = 'NEO';
                }
                if (assethash === GAS3_CONTRACT) {
                    txItem.symbol = 'GAS';
                    txItem.value = new BigNumber(-amount)
                        .shiftedBy(-8)
                        .toFixed();
                }
                result.push(txItem);
            }
        );
        data.received.forEach(
            ({
                timestamp,
                assethash,
                transferaddress,
                amount,
                txhash,
                blockindex,
            }) => {
                const txItem: Transaction = {
                    block_time: Math.floor(timestamp / 1000),
                    asset_id: assethash,
                    from: [transferaddress],
                    to: [data.address],
                    value: amount,
                    txid: txhash,
                    type: 'received',
                    id: blockindex,
                };
                if (assethash === NEO3_CONTRACT) {
                    txItem.symbol = 'NEO';
                }
                if (assethash === GAS3_CONTRACT) {
                    txItem.symbol = 'GAS';
                    txItem.value = new BigNumber(amount)
                        .shiftedBy(-8)
                        .toFixed();
                }
                result.push(txItem);
            }
        );
        // return of(result).toPromise();
        return this.getN3AssetSymbolAndDecimal(result);
    }
    private getNeo2AssetSymbolAndDecimal(
        target: Transaction[]
    ): Promise<Transaction[]> {
        const rpcUrl = this.global.n2Network.rpcUrl;
        const targetIndexs = [];
        const rpcAssetDecimalsReqs = [];
        const rpcAssetSymbolReqs = [];
        target.forEach(({ asset_id }, index) => {
            if (asset_id === NEO || asset_id === GAS) {
                return;
            }
            if (this.assetState.n2AssetDetail.has(asset_id) === true) {
                const decimals =
                    this.assetState.n2AssetDetail.get(asset_id).decimals;
                target[index].symbol =
                    this.assetState.n2AssetDetail.get(asset_id).symbol;
                target[index].value = new BigNumber(target[index].value)
                    .shiftedBy(-decimals)
                    .toFixed();
            }
            if (this.assetState.n2AssetDetail.has(asset_id) === false) {
                const data = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'invokefunction',
                    params: [asset_id, 'decimals'],
                };
                const decimalsReq = this.http.rpcPost(rpcUrl, data).toPromise();
                const symbolReq = this.http
                    .rpcPost(rpcUrl, {
                        ...data,
                        params: [asset_id, 'symbol'],
                    })
                    .toPromise();
                targetIndexs.push(index);
                rpcAssetDecimalsReqs.push(decimalsReq);
                rpcAssetSymbolReqs.push(symbolReq);
            }
        });
        if (
            rpcAssetDecimalsReqs.length === 0 &&
            rpcAssetSymbolReqs.length === 0
        ) {
            return of(target).toPromise();
        }
        return Promise.all([
            ...rpcAssetDecimalsReqs,
            ...rpcAssetSymbolReqs,
        ]).then((res) => {
            targetIndexs.forEach((key, index) => {
                const id = target[key].asset_id;
                const assetDetailItem: Asset = { asset_id: id };
                // decimals
                if (res[index].stack) {
                    if (res[index].stack[0].type === 'Integer') {
                        assetDetailItem.decimals = Number(
                            res[index].stack[0].value || 0
                        );
                    }
                    if (res[index].stack[0].type === 'ByteArray') {
                        assetDetailItem.decimals = new BigNumber(
                            res[index].stack[0].value || 0,
                            16
                        ).toNumber();
                    }
                }
                // symbol
                const symbolIndex = targetIndexs.length + index;
                if (res[symbolIndex].stack) {
                    if (res[symbolIndex].stack[0].type === 'ByteArray') {
                        assetDetailItem.symbol = hexstring2str(
                            res[symbolIndex].stack[0].value
                        );
                    }
                    if (res[symbolIndex].stack[0].type === 'ByteString') {
                        assetDetailItem.symbol = hexstring2str(
                            base642hex(res[symbolIndex].stack[0].value)
                        );
                    }
                }
                target[targetIndexs[index]].symbol = assetDetailItem.symbol;
                target[targetIndexs[index]].value = new BigNumber(
                    target[targetIndexs[index]].value
                )
                    .shiftedBy(-assetDetailItem.decimals)
                    .toFixed();
                this.assetState.n2AssetDetail.set(id, assetDetailItem);
            });
            return target;
        });
    }
    private getN3AssetSymbolAndDecimal(
        target: Transaction[]
    ): Promise<Transaction[]> {
        const rpcUrl = this.global.n3Network.rpcUrl;
        const targetIndexs = [];
        const rpcAssetDecimalsReqs = [];
        const rpcAssetSymbolReqs = [];
        target.forEach(({ asset_id }, index) => {
            if (asset_id === NEO3_CONTRACT || asset_id === GAS3_CONTRACT) {
                return;
            }
            if (this.assetState.n3AssetDetail.has(asset_id) === true) {
                const decimals =
                    this.assetState.n3AssetDetail.get(asset_id).decimals;
                target[index].symbol =
                    this.assetState.n3AssetDetail.get(asset_id).symbol;
                target[index].value = new BigNumber(target[index].value)
                    .shiftedBy(-decimals)
                    .toFixed();
            }
            if (this.assetState.n3AssetDetail.has(asset_id) === false) {
                const data = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'invokefunction',
                    params: [asset_id, 'decimals'],
                };
                const decimalsReq = this.http.rpcPost(rpcUrl, data).toPromise();
                const symbolReq = this.http
                    .rpcPost(rpcUrl, {
                        ...data,
                        params: [asset_id, 'symbol'],
                    })
                    .toPromise();
                targetIndexs.push(index);
                rpcAssetDecimalsReqs.push(decimalsReq);
                rpcAssetSymbolReqs.push(symbolReq);
            }
        });
        if (
            rpcAssetDecimalsReqs.length === 0 &&
            rpcAssetSymbolReqs.length === 0
        ) {
            return of(target).toPromise();
        }
        return Promise.all([
            ...rpcAssetDecimalsReqs,
            ...rpcAssetSymbolReqs,
        ]).then((res) => {
            targetIndexs.forEach((key, index) => {
                const id = target[key].asset_id;
                const assetDetailItem: Asset = { asset_id: id };
                // decimals
                if (res[index].stack) {
                    if (res[index].stack[0].type === 'Integer') {
                        assetDetailItem.decimals = Number(
                            res[index].stack[0].value || 0
                        );
                    }
                    if (res[index].stack[0].type === 'ByteArray') {
                        assetDetailItem.decimals = new BigNumber(
                            res[index].stack[0].value || 0,
                            16
                        ).toNumber();
                    }
                }
                // symbol
                const symbolIndex = targetIndexs.length + index;
                if (res[symbolIndex].stack) {
                    if (res[symbolIndex].stack[0].type === 'ByteArray') {
                        assetDetailItem.symbol = hexstring2str(
                            res[symbolIndex].stack[0].value
                        );
                    }
                    if (res[symbolIndex].stack[0].type === 'ByteString') {
                        assetDetailItem.symbol = hexstring2str(
                            base642hex(res[symbolIndex].stack[0].value)
                        );
                    }
                }
                target[targetIndexs[index]].symbol = assetDetailItem.symbol;
                target[targetIndexs[index]].value = new BigNumber(
                    target[targetIndexs[index]].value
                )
                    .shiftedBy(-assetDetailItem.decimals)
                    .toFixed();
                this.assetState.n3AssetDetail.set(id, assetDetailItem);
            });
            return target;
        });
    }
    private handleNeo2TxDetailResponse(data) {
        data.vin = data.vin.reduce((prev, element) => {
            if (!prev.find((item) => item === element.address)) {
                prev.push(element.address);
            }
            return prev;
        }, []);
        data.vout = data.vout.reduce((prev, element) => {
            if (!prev.find((item) => item === element.address)) {
                prev.push(element.address);
            }
            return prev;
        }, []);
        return data;
    }
    //#endregion
}
