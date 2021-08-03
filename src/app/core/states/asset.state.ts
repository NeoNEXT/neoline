import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import { ChromeService } from '../services/chrome.service';
import { Observable, Subject, from, of, forkJoin } from 'rxjs';
import { Asset, Balance, Nep5Detail } from 'src/models/models';
import { map, switchMap, refCount, publish } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { GasFeeSpeed } from '@popup/_lib/type';
import { bignumber } from 'mathjs';
import { rpc } from '@cityofzion/neon-js';
import { NeonService } from '../services/neon.service';
import { NEO3_CONTRACT, GAS3_CONTRACT } from '@popup/_lib';
import { RateStorageName } from '@/app/popup/_lib/setting';

@Injectable()
export class AssetState {
    public assetFile: Map<string, {}> = new Map();
    public defaultAssetSrc = '/assets/images/default_asset_logo.jpg';
    public $webAddAssetId: Subject<Balance> = new Subject();
    public $webDelAssetId: Subject<string> = new Subject();
    public assetRate: Map<string, {}> = new Map();
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

    constructor(
        private http: HttpService,
        private global: GlobalService,
        private chrome: ChromeService,
        private httpClient: HttpClient,
        private neonService: NeonService
    ) {
        this.chrome.getAssetFile().subscribe((res) => {
            this.assetFile = res;
        });
        this.chrome.getRateCurrency().subscribe((res) => {
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
        if (currency === 'CNY') {
            if (this.neonService.currentWalletChainType === 'Neo3') {
                tempStorageName = RateStorageName.neo3AssetCNYRate;
            } else {
                tempStorageName = RateStorageName.assetCNYRate;
            }
        } else {
            if (this.neonService.currentWalletChainType === 'Neo3') {
                tempStorageName = RateStorageName.neo3AssetUSDRate;
            } else {
                tempStorageName = RateStorageName.assetUSDRate;
            }
        }
        this.chrome.getAssetRate(tempStorageName).subscribe((res) => {
            this.assetRate = res;
        });
    }

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

    public clearCache() {
        this.assetFile = new Map();
        this.assetRate = new Map();
    }

    public detail(address: string, id: string): Observable<Balance> {
        return this.fetchBalance(address).pipe(
            switchMap((balance) =>
                this.chrome
                    .getWatch(address, this.neonService.currentWalletChainType)
                    .pipe(
                        map((watching) => {
                            return (
                                balance.find((e) => e.asset_id === id) ||
                                watching.find((w) => w.asset_id === id)
                            );
                        })
                    )
            )
        );
    }

    public fetchBalance(address: string): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3AddressTokens(address);
        }
        return this.http
            .get(
                `${this.global.apiDomain}/v1/neo2/address/assets?address=${address}`
            )
            .pipe(
                map((res) => {
                    const result = [];
                    res.asset = res.asset || [];
                    res.nep5 = res.nep5 || [];
                    res.asset.forEach((item) => {
                        result.push(item);
                    });
                    res.nep5.forEach((item) => {
                        result.push(item);
                    });
                    return result;
                })
            );
    }

    public fetchClaim(address: string): Observable<any> {
        const getClaimable = from(
            rpc.Query.getClaimable(address).execute(this.global.RPCDomain)
        );
        const getUnclaimed = from(
            rpc.Query.getUnclaimed(address).execute(this.global.RPCDomain)
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

    public fetchAll(): Promise<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3TokenList().toPromise();
        }
        return this.http
            .get(`${this.global.apiDomain}/v1/neo2/assets`)
            .toPromise();
    }

    public fetchAllowList(): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3PopularToken();
        }
        return from(
            this.http
                .get(`${this.global.apiDomain}/v1/neo2/allowlist`)
                .toPromise()
        ).pipe(
            map((res) => {
                return res || [];
            })
        );
    }

    public searchAsset(query: string): Observable<any> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.searchNeo3Token(query);
        }
        return this.http.get(
            `${this.global.apiDomain}/v1/neo2/search/asset?q=${query}`
        );
    }

    public getAssetImageFromUrl(url: string, lastModified: string) {
        return this.http.getImage(url, lastModified);
    }

    public setAssetFile(res: XMLHttpRequest, assetId: string): Promise<any> {
        const temp = {};
        temp['last-modified'] = res.getResponseHeader('Last-Modified');
        return new Promise((resolve, reject) => {
            const a = new FileReader();
            a.readAsDataURL(res.response); // 读取文件保存在result中
            a.onload = (e: any) => {
                const getRes = e.target.result; // 读取的结果在result中
                temp['image-src'] = getRes;
                this.assetFile.set(assetId, temp);
                this.chrome.setAssetFile(this.assetFile);
                resolve(getRes);
            };
        });
    }
    public getRate(): Observable<any> {
        const chain = this.neonService.currentWalletChainType === 'Neo3' ? 'neo3' : 'neo';
        return this.http.get(
            `${this.global.apiDomain}/v1/coin/rates?chain=${chain}`
        );
    }

    public getFiatRate(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/fiat/rates`);
    }

    public getAssetRate(coins: string): Observable<any> {
        if (!coins) {
            return of({});
        }
        coins = coins.toLowerCase();
        const coinsAry = coins.split(',');
        const rateRes = {};
        let targetCoins = '';
        coinsAry.forEach((element) => {
            const tempAssetRate = this.assetRate.get(element);
            if (tempAssetRate && tempAssetRate['last-modified']) {
                rateRes[element] = tempAssetRate['rate'];
                if (
                    new Date().getTime() / 1000 -
                        tempAssetRate['last-modified'] >
                    1200
                ) {
                    targetCoins += element + ',';
                }
            } else {
                targetCoins += element + ',';
            }
        });
        targetCoins = targetCoins.slice(0, -1);
        if (targetCoins === '') {
            return of(rateRes);
        }
        return forkJoin([this.getRate(), this.getFiatRate()]).pipe(
            map((result) => {
                const rateBalance = result[0];
                const fiatData = result[1];
                const targetCoinsAry = targetCoins.split(',');
                targetCoinsAry.forEach((coin) => {
                    const tempRate = {};
                    tempRate['last-modified'] = rateBalance['response_time'];
                    if (coin in rateBalance) {
                        tempRate['rate'] = bignumber(
                            rateBalance[coin].price || 0
                        )
                            .mul(
                                bignumber(
                                    fiatData.rates &&
                                        fiatData.rates[
                                            this.rateCurrency.toUpperCase()
                                        ]
                                ) || 0
                            )
                            .toFixed();
                        rateRes[coin] = tempRate['rate'];
                    } else {
                        tempRate['rate'] = undefined;
                        rateRes[coin] = undefined;
                    }
                    this.assetRate.set(coin, tempRate);
                });
                let tempStorageName;
                if (this.rateCurrency === 'CNY') {
                    if (this.neonService.currentWalletChainType === 'Neo3') {
                        tempStorageName = RateStorageName.neo3AssetCNYRate;
                    } else {
                        tempStorageName = RateStorageName.assetCNYRate;
                    }
                } else {
                    if (this.neonService.currentWalletChainType === 'Neo3') {
                        tempStorageName = RateStorageName.neo3AssetUSDRate;
                    } else {
                        tempStorageName = RateStorageName.assetUSDRate;
                    }
                }
                this.chrome.setAssetRate(this.assetRate, tempStorageName);
                return rateRes;
            })
        );
    }

    public async getAssetImage(asset: Asset) {
        const imageObj = this.assetFile.get(asset.asset_id);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            return imageObj['image-src'];
        }
        const assetRes = await this.getAssetImageFromUrl(
            asset.image_url,
            lastModified
        ).toPromise();
        if (assetRes && assetRes.status === 200) {
            const src = await this.setAssetFile(assetRes, asset.asset_id);
        } else if (assetRes && assetRes.status === 404) {
            return this.defaultAssetSrc;
        }
    }

    public getAssetImageFromAssetId(asset: string) {
        const imageObj = this.assetFile.get(asset);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            return imageObj['image-src'];
        } else {
            return this.defaultAssetSrc;
        }
    }

    public getNep5Detail(assetId: string): Observable<Nep5Detail> {
        if (this.neonService.currentWalletChainType === 'Neo3') {
            return this.fetchNeo3AssetDetail(assetId);
        }
        return this.http.get(
            `${this.global.apiDomain}/v1/neo2/nep5/${assetId}`
        );
    }

    public async getMoney(symbol: string, balance: number): Promise<string> {
        let rate: any;
        try {
            rate = await this.getAssetRate(symbol).toPromise();
        } catch (error) {
            rate = {};
        }
        if (symbol.toLowerCase() in rate) {
            return this.global
                .mathmul(Number(rate[symbol.toLowerCase()]), Number(balance))
                .toString();
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

    //#region neo3
    /**
     * 格式化neo3 接口返回数据，字段名 contract => asset_id
     * @param data 接口数据
     */
    formatResponseData(data: any[]) {
        return data && data.map((item) => {
            item.asset_id = item.contract;
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
     * 获取指定网络节点所有资产
     */
    fetchNeo3TokenList(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/assets`).pipe(
            map((res) => {
                return this.formatResponseData(res);
            })
        );
    }

    /**
     * 获取某地址大于 0 的资产
     * @param address 地址
     */
    fetchNeo3AddressTokens(address: string): Observable<any> {
        return this.http
            .get(`${this.global.apiDomain}/v1/neo3/address/assets?address=${address}`)
            .pipe(
                map((res) => {
                    return this.formatResponseData(res);
                })
            );
    }

    /**
     * 获取推荐资产
     */
    fetchNeo3PopularToken(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/allowlist`).pipe(
            map((res) => {
                return this.formatResponseData(res);
            })
        );
    }

    /**
     * 模糊搜素资产信息
     * @param query 搜索信息
     */
    searchNeo3Token(query: string): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/search/asset?q=${query}`).pipe(
            map((res) => {
                return this.formatResponseData(res);
            })
        );
    }

    fetchNeo3GasFee(): Observable<any> {
        return this.http.get(`${this.global.apiDomain}/v1/neo3/fees`).pipe(
            map((res: any) => {
                res.slow_price = bignumber(res.slow_price).dividedBy(bignumber(10).pow(8)).toFixed();
                res.propose_price = bignumber(res.propose_price).dividedBy(bignumber(10).pow(8)).toFixed();
                res.fast_price = bignumber(res.fast_price).dividedBy(bignumber(10).pow(8)).toFixed();
                this.neo3GasFeeSpeed = res || this.gasFeeDefaultSpeed;
                return res || this.gasFeeDefaultSpeed;
            })
        );
    }

    /**
     * 获取资产详情
     * @param assetId 资产id
     */
    public fetchNeo3AssetDetail(assetId: string): Observable<any> {
        return this.http.get(
            `${this.global.apiDomain}/neo3/asset/${assetId}`
        ).pipe(
            map((res) => {
                return this.formatResponseData(res);
            })
        );
    }
    //#endregion
}
