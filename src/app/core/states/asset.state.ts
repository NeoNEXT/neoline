import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import { ChromeService } from '../services/chrome.service';
import { Observable, Subject, from, of, forkJoin } from 'rxjs';
import { Asset, Balance, NEO, GAS, UTXO } from 'src/models/models';
import { map, refCount, publish } from 'rxjs/operators';
import { GasFeeSpeed } from '@popup/_lib/type';
import { bignumber } from 'mathjs';
import { rpc } from '@cityofzion/neon-js';
import { NeonService } from '../services/neon.service';
import {
    NEO3_CONTRACT,
    GAS3_CONTRACT,
    ChainType,
    DEFAULT_NEO2_ASSETS,
    STORAGE_NAME,
    DEFAULT_NEO3_ASSETS,
    NetworkType,
} from '@popup/_lib';
import BigNumber from 'bignumber.js';
import { hexstring2str, base642hex } from '@cityofzion/neon-core-neo3/lib/u';

@Injectable()
export class AssetState {
    public $webAddAssetId: Subject<Balance> = new Subject();
    public $webDelAssetId: Subject<string> = new Subject();
    private assetRate: Map<string, {}> = new Map();
    private neo3AssetRate: Map<string, {}> = new Map();
    public rateCurrency: string;

    public balanceSource = new Subject<Balance[]>();
    public balanceSub$ = this.balanceSource.asObservable();
    public gasFeeSpeed: GasFeeSpeed;
    public neo3GasFeeSpeed: GasFeeSpeed;
    public gasFeeDefaultSpeed: GasFeeSpeed = {
        slow_price: '0',
        propose_price: '0.011',
        fast_price: '0.2',
    };

    public n2AssetDetail: Map<string, Asset> = new Map();
    public n3AssetDetail: Map<string, Asset> = new Map();

    constructor(
        private http: HttpService,
        private global: GlobalService,
        private chrome: ChromeService,
        private neonService: NeonService
    ) {
        this.chrome.getStorage(STORAGE_NAME.rateCurrency).subscribe((res) => {
            this.rateCurrency = res;
            this.changeRateCurrency(res);
        });
    }

    public pushBalance(balance: Balance[]) {
        this.balanceSource.next(balance);
    }
    public changeRateCurrency(currency) {
        this.rateCurrency = currency;
        let tempStorageName;
        const isNeo3 = this.neonService.currentWalletChainType === 'Neo3';
        if (currency === 'CNY') {
            tempStorageName = isNeo3
                ? STORAGE_NAME.neo3AssetCNYRate
                : STORAGE_NAME.assetCNYRate;
        } else {
            tempStorageName = isNeo3
                ? STORAGE_NAME.neo3AssetUSDRate
                : STORAGE_NAME.assetUSDRate;
        }
        this.chrome.getStorage(tempStorageName).subscribe((res) => {
            if (isNeo3) {
                this.neo3AssetRate = res;
            } else {
                this.assetRate = res;
            }
        });
    }

    //#region add remove asset
    public pushDelAssetId(id) {
        this.$webDelAssetId.next(id);
    }

    public popDelAssetId(): Observable<any> {
        return this.$webDelAssetId.pipe(publish(), refCount());
    }

    public pushAddAssetId(id) {
        this.$webAddAssetId.next(id);
    }

    public popAddAssetId(): Observable<any> {
        return this.$webAddAssetId.pipe(publish(), refCount());
    }
    //#endregion

    public getNeo2Utxo(address: string, assetId: string): Observable<UTXO[]> {
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'getunspents',
            params: [address],
        };
        const rpcUrl = this.global.n2Network.rpcUrl;
        return this.http.rpcPost(rpcUrl, data).pipe(
            map((res) => {
                if (assetId.includes(res.balance[0].asset_hash)) {
                    return res.balance[0].unspent.map(({ n, value, txid }) => ({
                        n,
                        txid,
                        value,
                        asset_id: res.balance[0].asset_hash,
                    }));
                }
                if (assetId.includes(res.balance[1].asset_hash)) {
                    return res.balance[1].unspent.map(({ n, value, txid }) => ({
                        n,
                        txid,
                        value,
                        asset_id: res.balance[1].asset_hash,
                    }));
                }
            })
        );
    }

    public clearCache() {
        this.assetRate = new Map();
        this.neo3AssetRate = new Map();
    }

    public fetchClaim(address: string): Observable<any> {
        const getClaimable = from(
            rpc.Query.getClaimable(address).execute(
                this.global.n2Network.rpcUrl
            )
        );
        const getUnclaimed = from(
            rpc.Query.getUnclaimed(address).execute(
                this.global.n2Network.rpcUrl
            )
        );
        return forkJoin([getClaimable, getUnclaimed]).pipe(
            map((res) => {
                const result = {
                    available: 0,
                    unavailable: 0,
                    claimable: [],
                };
                const claimableData = res[0];
                const unclaimed = res[1];
                result.available = unclaimed.result.available || 0;
                result.unavailable = unclaimed.result.unavailable || 0;
                result.claimable = claimableData.result.claimable || [];
                return result;
            })
        );
    }

    public getRate(): Observable<any> {
        const chain =
            this.neonService.currentWalletChainType === 'Neo3' ? 'neo3' : 'neo';
        return this.http.get(
            `${this.global.apiDomain}/v1/coin/rates?chain=${chain}`
        );
    }

    private getFiatRate(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/fiat/rates`);
    }

    public getAssetRate(coins: string): Observable<any> {
        const isNeo3 = this.neonService.currentWalletChainType === 'Neo3';
        if (
            !coins ||
            (isNeo3 && this.global.n3Network.network !== NetworkType.MainNet) ||
            (!isNeo3 && this.global.n2Network.network !== NetworkType.MainNet)
        ) {
            return of({});
        }
        coins = coins.toLowerCase();
        const rateRes = {};
        return forkJoin([this.getRate(), this.getFiatRate()]).pipe(
            map(([rateBalance, fiatData]) => {
                const targetCoinsAry = coins.split(',');
                targetCoinsAry.forEach((coin) => {
                    const tempRate: any = {};
                    const price =
                        rateBalance[coin]?.price &&
                        new BigNumber(rateBalance[coin].price);
                    const currency = this.rateCurrency.toUpperCase();
                    const fiat =
                        fiatData.rates[currency] &&
                        new BigNumber(fiatData.rates[currency]);
                    tempRate.rate =
                        price && fiat
                            ? new BigNumber(price)
                                  .times(new BigNumber(fiat))
                                  .toFixed()
                            : undefined;
                    rateRes[coin] = tempRate.rate;
                    isNeo3
                        ? this.neo3AssetRate.set(coin, tempRate)
                        : this.assetRate.set(coin, tempRate);
                });
                let tempStorageName;
                if (this.rateCurrency === 'CNY') {
                    if (this.neonService.currentWalletChainType === 'Neo3') {
                        tempStorageName = STORAGE_NAME.neo3AssetCNYRate;
                    } else {
                        tempStorageName = STORAGE_NAME.assetCNYRate;
                    }
                } else {
                    if (this.neonService.currentWalletChainType === 'Neo3') {
                        tempStorageName = STORAGE_NAME.neo3AssetUSDRate;
                    } else {
                        tempStorageName = STORAGE_NAME.assetUSDRate;
                    }
                }
                this.chrome.setStorage(
                    tempStorageName,
                    isNeo3 ? this.neo3AssetRate : this.assetRate
                );
                return rateRes;
            })
        );
    }

    getAssetSymbol(assetId: string): Observable<string> {
        const isN3 = this.neonService.currentWalletChainType === 'Neo3';
        if (!isN3 && this.n2AssetDetail.has(assetId) === true) {
            return of(this.n2AssetDetail.get(assetId).symbol);
        }
        if (isN3 && this.n3AssetDetail.has(assetId) === true) {
            return of(this.n3AssetDetail.get(assetId).symbol);
        }
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'invokefunction',
            params: [assetId, 'symbol'],
        };
        const rpcUrl = isN3
            ? this.global.n3Network.rpcUrl
            : this.global.n2Network.rpcUrl;
        return this.http.rpcPost(rpcUrl, data).pipe(
            map((res) => {
                let symbol = res.stack[0].value;
                if (res.stack) {
                    if (res.stack[0].type === 'ByteArray') {
                        symbol = hexstring2str(res.stack[0].value);
                    }
                    if (res.stack[0].type === 'ByteString') {
                        symbol = hexstring2str(base642hex(res.stack[0].value));
                    }
                }
                return symbol;
            })
        );
    }

    public async getMoney(
        symbol: string,
        balance: string | number
    ): Promise<string> {
        let rate: any;
        try {
            rate = await this.getAssetRate(symbol).toPromise();
        } catch (error) {
            rate = {};
        }
        if (symbol.toLowerCase() in rate) {
            return bignumber(rate[symbol.toLowerCase()])
                .times(bignumber(balance))
                .toFixed();
        } else {
            return '0';
        }
    }

    public getGasFee(): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3GasFee();
        }
        return this.http.get(`${this.global.apiDomain}/v1/neo2/fees`).pipe(
            map((res: any) => {
                this.gasFeeSpeed = res || this.gasFeeDefaultSpeed;
                return res || this.gasFeeDefaultSpeed;
            })
        );
    }

    fetchNeo3GasFee(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/fees`).pipe(
            map((res: any) => {
                res.slow_price = bignumber(res.slow_price)
                    .dividedBy(bignumber(10).pow(8))
                    .toFixed();
                res.propose_price = bignumber(res.propose_price)
                    .dividedBy(bignumber(10).pow(8))
                    .toFixed();
                res.fast_price = bignumber(res.fast_price)
                    .dividedBy(bignumber(10).pow(8))
                    .toFixed();
                this.neo3GasFeeSpeed = res || this.gasFeeDefaultSpeed;
                return res || this.gasFeeDefaultSpeed;
            })
        );
    }

    public async searchAsset(q: string): Promise<Asset> {
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'getcontractstate',
            params: [q],
        };
        const isN3 = this.neonService.currentWalletChainType === 'Neo3';
        const rpcUrl = isN3
            ? this.global.n3Network.rpcUrl
            : this.global.n2Network.rpcUrl;
        const res = await this.http.rpcPost(rpcUrl, data).toPromise();
        const symbol = await this.getAssetSymbol(res.hash).toPromise();
        const decimals = await this.getAssetDecimal(res.hash).toPromise();
        const asset: Asset = {
            name: isN3 ? res.manifest.name : res.name,
            asset_id: res.hash,
            symbol,
            decimals,
        };
        return asset;
    }

    async getAssetDetail(address: string, assetId: string): Promise<Asset> {
        const balance = await this.getAddressBalances(address);
        const watching = await this.chrome
            .getWatch(
                address,
                this.neonService.currentWalletChainType,
                this.neonService.currentWalletChainType === 'Neo2'
                    ? this.global.n2Network.network
                    : this.global.n3Network.network
            )
            .toPromise();
        return (
            balance.find((e) => e.asset_id === assetId) ||
            watching.find((w) => w.asset_id === assetId)
        );
    }

    async getAddressBalances(
        address: string,
        chain?: ChainType
    ): Promise<Asset[]> {
        if (
            chain
                ? chain === 'Neo3'
                : this.neonService.currentWalletChainType === 'Neo3'
        ) {
            return this.getN3AddressBalances(address);
        }
        return this.getNeo2AddressBalances(address);
    }

    public getUnclaimedGas(address: string): Observable<any> {
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'getunclaimedgas',
            params: [address],
        };
        return this.http.rpcPost(this.global.n3Network.rpcUrl, data);
    }

    //#region private function
    private async getNeo2AddressBalances(address: string): Promise<Asset[]> {
        const data = {
            jsonrpc: '2.0',
            method: 'getnep5balances',
            params: [address],
            id: 1,
        };
        const nativeRes = await this.http
            .rpcPost(this.global.n2Network.rpcUrl, {
                ...data,
                method: 'getaccountstate',
            })
            .toPromise();
        const nep5Res = await this.http
            .rpcPost(this.global.n2Network.rpcUrl, data)
            .toPromise();
        const nativeTarget = this.handleNeo2NativeBalanceResponse(nativeRes);
        const nep5Target = await this.handleNeo2BalancesResponse(nep5Res);
        return nativeTarget.concat(nep5Target);
    }
    private async getN3AddressBalances(address: string): Promise<Asset[]> {
        const data = {
            jsonrpc: '2.0',
            method: 'getnep17balances',
            params: [address],
            id: 1,
        };
        const n3Res = await this.http
            .rpcPost(this.global.n3Network.rpcUrl, data)
            .toPromise();
        return this.handleN3BalancesResponse(n3Res);
    }
    private handleNeo2NativeBalanceResponse(data) {
        const target = [DEFAULT_NEO2_ASSETS.NEO, DEFAULT_NEO2_ASSETS.GAS];
        data.balances.forEach((item) => {
            if (item.asset === NEO) {
                target[0].balance = item.value;
            }
            if (item.asset === GAS) {
                target[1].balance = item.value;
            }
        });
        return target;
    }
    private handleNeo2BalancesResponse(data): Promise<Asset[]> {
        const result: Asset[] = [];
        data.balance.forEach(({ amount, asset_hash }) => {
            result.push({
                balance: amount,
                asset_id: asset_hash,
            });
        });
        // return of(result).toPromise();
        return this.getNeo2AssetSymbolAndDecimal(result);
    }
    private handleN3BalancesResponse(data): Promise<Asset[]> {
        const result: Asset[] = [];
        let hasNeo = false;
        let hasGas = false;
        data.balance.forEach(({ amount, assethash }) => {
            const assetItem: Asset = {
                balance: amount,
                asset_id: assethash,
            };
            if (assethash === NEO3_CONTRACT) {
                hasNeo = true;
                assetItem.symbol = DEFAULT_NEO3_ASSETS.NEO.symbol;
                assetItem.decimals = DEFAULT_NEO3_ASSETS.NEO.decimals;
                result.unshift(assetItem);
            } else if (assethash === GAS3_CONTRACT) {
                hasGas = true;
                assetItem.symbol = DEFAULT_NEO3_ASSETS.GAS.symbol;
                assetItem.decimals = DEFAULT_NEO3_ASSETS.GAS.decimals;
                assetItem.balance = new BigNumber(amount)
                    .shiftedBy(-8)
                    .toFixed();
                result.unshift(assetItem);
            } else {
                result.push(assetItem);
            }
        });
        if (hasGas && hasNeo && result[1].asset_id === NEO3_CONTRACT) {
            const temp = result[0];
            result[0] = result[1];
            result[1] = temp;
        }
        if (hasGas === false) {
            result.unshift(DEFAULT_NEO3_ASSETS.GAS);
        }
        if (hasNeo === false) {
            result.unshift(DEFAULT_NEO3_ASSETS.NEO);
        }
        // return of(result).toPromise();
        return this.getN3AssetSymbolAndDecimal(result);
    }
    private getNeo2AssetSymbolAndDecimal(target: Asset[]): Promise<Asset[]> {
        const rpcUrl = this.global.n2Network.rpcUrl;
        const targetIndexs = [];
        const rpcAssetDecimalsReqs = [];
        const rpcAssetSymbolReqs = [];
        target.forEach(({ asset_id }, index) => {
            if (asset_id === NEO || asset_id === GAS) {
                return;
            }
            if (this.n2AssetDetail.has(asset_id) === true) {
                target[index].decimals =
                    this.n2AssetDetail.get(asset_id).decimals;
                target[index].symbol = this.n2AssetDetail.get(asset_id).symbol;
                target[index].balance = new BigNumber(target[index].balance)
                    .shiftedBy(-target[index].decimals)
                    .toFixed();
            }
            if (this.n2AssetDetail.has(asset_id) === false) {
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
                target[targetIndexs[index]].decimals = assetDetailItem.decimals;
                target[targetIndexs[index]].symbol = assetDetailItem.symbol;
                target[targetIndexs[index]].balance = new BigNumber(
                    target[targetIndexs[index]].balance
                )
                    .shiftedBy(-assetDetailItem.decimals)
                    .toFixed();
                this.n2AssetDetail.set(id, assetDetailItem);
            });
            console.log(this.n2AssetDetail);
            return target;
        });
    }
    private getN3AssetSymbolAndDecimal(target: Asset[]): Promise<Asset[]> {
        const rpcUrl = this.global.n3Network.rpcUrl;
        const targetIndexs = [];
        const rpcAssetDecimalsReqs = [];
        const rpcAssetSymbolReqs = [];
        target.forEach(({ asset_id }, index) => {
            if (asset_id === NEO3_CONTRACT || asset_id === GAS3_CONTRACT) {
                return;
            }
            if (this.n3AssetDetail.has(asset_id) === true) {
                target[index].decimals =
                    this.n3AssetDetail.get(asset_id).decimals;
                target[index].symbol = this.n3AssetDetail.get(asset_id).symbol;
                target[index].balance = new BigNumber(target[index].balance)
                    .shiftedBy(-target[index].decimals)
                    .toFixed();
            }
            if (this.n3AssetDetail.has(asset_id) === false) {
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
                target[targetIndexs[index]].decimals = assetDetailItem.decimals;
                target[targetIndexs[index]].symbol = assetDetailItem.symbol;
                target[targetIndexs[index]].balance = new BigNumber(
                    target[targetIndexs[index]].balance
                )
                    .shiftedBy(-assetDetailItem.decimals)
                    .toFixed();
                this.n3AssetDetail.set(id, assetDetailItem);
            });
            console.log(this.n2AssetDetail);
            return target;
        });
    }
    private getAssetDecimal(assetId: string): Observable<number> {
        const isN3 = this.neonService.currentWalletChainType === 'Neo3';
        if (!isN3 && this.n2AssetDetail.has(assetId) === true) {
            return of(this.n2AssetDetail.get(assetId).decimals);
        }
        if (isN3 && this.n3AssetDetail.has(assetId) === true) {
            return of(this.n3AssetDetail.get(assetId).decimals);
        }
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'invokefunction',
            params: [assetId, 'decimals'],
        };
        const rpcUrl = isN3
            ? this.global.n3Network.rpcUrl
            : this.global.n2Network.rpcUrl;
        return this.http.rpcPost(rpcUrl, data).pipe(
            map((res) => {
                let decimals = res.stack[0].value;
                if (res.stack) {
                    if (res.stack[0].type === 'Integer') {
                        decimals = Number(res.stack[0].value || 0);
                    }
                    if (res.stack[0].type === 'ByteArray') {
                        decimals = new BigNumber(
                            res.stack[0].value || 0,
                            16
                        ).toNumber();
                    }
                }
                return decimals;
            })
        );
    }
    //#endregion
}
