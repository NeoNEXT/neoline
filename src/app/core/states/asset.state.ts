import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import { ChromeService } from '../services/chrome.service';
import { Observable, Subject, from, of, forkJoin } from 'rxjs';
import { Balance, AssetDetail, Nep5Detail } from 'src/models/models';
import { map, switchMap, refCount, publish } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { GasFeeSpeed } from '@popup/_lib/type';
import { bignumber } from 'mathjs';

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
    // goApi = 'http://47.110.14.167:8080';
    goApi = 'https://api.neoline.io';
    public gasFeeSpeed: GasFeeSpeed;
    public gasFeeDefaultSpeed: GasFeeSpeed = {
        slow_price: '0',
        propose_price: '0.011',
        fast_price: '0.2'
    }

    constructor(
        private http: HttpService,
        private global: GlobalService,
        private chrome: ChromeService,
        private httpClient: HttpClient
    ) {
        this.chrome.getAssetFile().subscribe(res => {
            this.assetFile = res;
        });
        this.chrome.getRateCurrency().subscribe(res => {
            this.rateCurrency = res;
            this.changeRateCurrency(res);
        });
    }

    public pushBalance(balance: Balance[]) {
        this.balanceSource.next(balance);
    }
    public changeRateCurrency(currency) {
        this.rateCurrency = currency;
        if (currency === 'CNY') {
            this.chrome.getAssetCNYRate().subscribe(res => {
                this.assetRate = res;
            });
        } else {
            this.chrome.getAssetUSDRate().subscribe(res => {
                this.assetRate = res;
            });
        }
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
            switchMap(balance =>
                this.chrome.getWatch().pipe(
                    map(watching => {
                        return (
                            balance.find(e => e.asset_id === id) ||
                            watching.find(w => w.asset_id === id)
                        );
                    })
                )
            )
        );
    }

    public fetchBalance(address: string): Observable<any> {
        return this.http
            .get(
                `${this.global.apiDomain}/v1/address/assets?address=${address}`
            )
            .pipe(
                map(res => {
                    this.pushBalance(res);
                    return res;
                })
            );
    }

    public fetchClaim(address: string): Observable<any> {
        return this.http.get(
            `${this.global.apiDomain}/v1/transactions/claim/${address}`
        );
    }

    public fetchAll(page: number): Promise<any> {
        return this.http
            .get(
                `${this.global.apiDomain}/v1/asset/getpluginsassets?page_index=${page}`
            )
            .toPromise();
    }

    public searchAsset(query: string): Observable<any> {
        return this.http.get(
            `${this.global.apiDomain}/v1/search?query=${query}`
        );
    }

    public getAssetSrc(
        assetId: string,
        lastModified: string
    ): Observable<any> {
        return this.http.getImage(
            `${this.global.apiDomain}/logo/${assetId}`,
            lastModified
        );
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
        return this.http.get(`${this.goApi}/v1/coin/rates?chain=neo`);
    }

    public getFiatRate(): Observable<any> {
        return this.http.get(`${this.goApi}/v1/fiat/rates`);
    }

    public getAssetRate(coins: string): Observable<any> {
        if (!coins) {
            return of({});
        }
        coins = coins.toLowerCase();
        const coinsAry = coins.split(',');
        const rateRes = {};
        let targetCoins = '';
        coinsAry.forEach(element => {
            const tempAssetRate = this.assetRate.get(element);
            if (tempAssetRate) {
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
        return forkJoin(this.getRate(), this.getFiatRate())
            .pipe(
                map(result => {
                    const rateBalance = result[0];
                    const fiatData = result[1];
                    const targetCoinsAry = targetCoins.split(',');
                    targetCoinsAry.forEach(coin => {
                        const tempRate = {};
                        tempRate['last-modified'] = rateBalance['response_time'];
                        if (coin in rateBalance) {
                            tempRate['rate'] = bignumber(rateBalance[coin].price || 0)
                                .mul(bignumber(fiatData.rates && fiatData.rates[this.rateCurrency.toUpperCase()]) || 0).toFixed();
                            rateRes[coin] = tempRate['rate'];
                        } else {
                            tempRate['rate'] = undefined;
                            rateRes[coin] = undefined;
                        }
                        this.assetRate.set(coin, tempRate);
                    });
                    if (this.rateCurrency === 'CNY') {
                        this.chrome.setAssetCNYRate(this.assetRate);
                    } else {
                        this.chrome.setAssetUSDRate(this.assetRate);
                    }
                    return rateRes;
                })
            );
    }

    public async getAssetImage(assetId: string) {
        const imageObj = this.assetFile.get(assetId);
        let lastModified = '';
        if (imageObj) {
            lastModified = imageObj['last-modified'];
            return imageObj['image-src'];
        }
        const assetRes = await this.getAssetSrc(assetId, lastModified).toPromise();
        if (assetRes && assetRes.status === 200) {
            const src = await this.setAssetFile(assetRes, assetId)
        } else if (assetRes && assetRes.status === 404) {
            return this.defaultAssetSrc;
        }
    }

    public getAssetDetail(assetId: string): Observable<AssetDetail> {
        return this.http.get(
            `${this.global.apiDomain}/v1/asset/${assetId}`
        );
    }

    public getNep5Detail(assetId: string): Observable<Nep5Detail> {
        return this.http.get(
            `${this.global.apiDomain}/v1/nep5/${assetId}`
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
            return this.global.mathmul(Number(rate[symbol.toLowerCase()]), Number(balance)).toString();
        } else {
            return '0';
        }
    }

    public getGasFee(): Observable<any> {
        return this.httpClient.get(`${this.goApi}/v1/neo2/fees`).pipe(map((res: any) => {
            if (res.status === 'success') {
                this.gasFeeSpeed = res.data;
                return res.data;
            }
        }));
    }
}
