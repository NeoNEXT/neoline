import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import { ChromeService } from '../services/chrome.service';
import { Observable, from, of, forkJoin } from 'rxjs';
import { Asset, NEO, GAS, UTXO } from 'src/models/models';
import { map } from 'rxjs/operators';
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
    private coinRates;
    private neo3CoinRates;
    private fiatRates;
    private rateRequestTime;
    public rateCurrency: string;

    public gasFeeSpeed: GasFeeSpeed;
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
        });
        this.getLocalRate();
    }

    getLocalRate() {
        const getNeo2CoinsRate = this.chrome.getStorage(STORAGE_NAME.coinsRate);
        const getN3CoinsRate = this.chrome.getStorage(
            STORAGE_NAME.neo3CoinsRate
        );
        const getFiatRate = this.chrome.getStorage(STORAGE_NAME.fiatRate);
        forkJoin([getNeo2CoinsRate, getN3CoinsRate, getFiatRate]).subscribe(
            ([coinRate, neo3CoinRate, fiatRate]) => {
                this.coinRates = coinRate;
                this.neo3CoinRates = neo3CoinRate;
                this.fiatRates = fiatRate;
            }
        );
    }

    clearCache() {
        this.coinRates = undefined;
        this.neo3CoinRates = undefined;
        this.fiatRates = undefined;
        this.rateRequestTime = undefined;
    }

    //#region claim
    // neo2
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
    //neo3
    public getUnclaimedGas(address: string): Observable<any> {
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'getunclaimedgas',
            params: [address],
        };
        return this.http.rpcPost(this.global.n3Network.rpcUrl, data);
    }
    //#endregion

    //#region rate
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

    public async getAssetRate(
        symbol: string,
        assetId: string
    ): Promise<BigNumber | undefined> {
        const isNeo3 = this.neonService.currentWalletChainType === 'Neo3';
        if (
            (isNeo3 && this.global.n3Network.network !== NetworkType.MainNet) ||
            (!isNeo3 && this.global.n2Network.network !== NetworkType.MainNet)
        ) {
            return undefined;
        }
        const time = new Date().getTime() / 1000;
        if (
            !this.rateRequestTime ||
            (isNeo3 && JSON.stringify(this.neo3CoinRates) === '{}') ||
            (!isNeo3 && JSON.stringify(this.coinRates) === '{}') ||
            (this.rateRequestTime && time - this.rateRequestTime > 300)
        ) {
            this.rateRequestTime = time;
            const coinRateTemp = await this.getRate().toPromise();
            if (isNeo3 && coinRateTemp) {
                coinRateTemp.neo.asset_id = NEO3_CONTRACT;
                this.neo3CoinRates = coinRateTemp;
                this.chrome.setStorage(
                    STORAGE_NAME.neo3CoinsRate,
                    coinRateTemp
                );
            }
            if (!isNeo3 && coinRateTemp) {
                coinRateTemp.neo.asset_id = NEO;
                this.coinRates = coinRateTemp;
                this.chrome.setStorage(STORAGE_NAME.coinsRate, coinRateTemp);
            }
            this.fiatRates = await this.getFiatRate().toPromise();
            this.chrome.setStorage(STORAGE_NAME.fiatRate, this.fiatRates);
        }
        symbol = symbol.toLowerCase();
        let price;
        if (
            isNeo3 &&
            this.neo3CoinRates[symbol] &&
            assetId.includes(this.neo3CoinRates[symbol].asset_id)
        ) {
            price = this.neo3CoinRates[symbol].price;
        }
        if (
            !isNeo3 &&
            this.coinRates[symbol] &&
            assetId.includes(this.coinRates[symbol].asset_id)
        ) {
            price = this.coinRates[symbol].price;
        }
        if (price) {
            const currency = this.rateCurrency.toUpperCase();
            const fiat =
                this.fiatRates.rates[currency] &&
                this.fiatRates.rates[currency];
            const rate =
                price && fiat
                    ? new BigNumber(price).times(new BigNumber(fiat))
                    : undefined;
            return rate;
        }
        return undefined;
    }
    //#endregion

    //#region other
    async searchAsset(q: string): Promise<Asset> {
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
            name: isN3 ? res?.manifest?.name : res?.name,
            asset_id: res?.hash,
            symbol,
            decimals,
        };
        return asset;
    }

    getNeo2Utxo(address: string, assetId: string): Observable<UTXO[]> {
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
    //#endregion

    //#region gas fee
    getGasFee(): Observable<any> {
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
                return res || this.gasFeeDefaultSpeed;
            })
        );
    }
    //#endregion

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
        (data?.balances || []).forEach((item) => {
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
        (data?.balance || []).forEach(({ amount, asset_hash }) => {
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
        (data?.balance || []).forEach(({ amount, assethash }) => {
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
                const decimalsReq = this.http
                    .rpcPost(rpcUrl, data)
                    .toPromise()
                    .catch((err) => err);
                const symbolReq = this.http
                    .rpcPost(rpcUrl, {
                        ...data,
                        params: [asset_id, 'symbol'],
                    })
                    .toPromise()
                    .catch((err) => err);
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
                const decimalsReq = this.http
                    .rpcPost(rpcUrl, data)
                    .toPromise()
                    .catch((err) => err);
                const symbolReq = this.http
                    .rpcPost(rpcUrl, {
                        ...data,
                        params: [asset_id, 'symbol'],
                    })
                    .toPromise()
                    .catch((err) => err);
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
