import {
    Injectable
} from '@angular/core';
import {
    HttpService
} from '../services/http.service';
import {
    GlobalService
} from '../services/global.service';
import {
    ChromeService
} from '../services/chrome.service';
import {
    Observable,
    Subject,
    from,
    of ,
} from 'rxjs';
import {
    Balance,
} from 'src/models/models';
import {
    map,
    switchMap,
    refCount,
    publish,
} from 'rxjs/operators';

@Injectable()
export class AssetState {
    public assetFile: Map < string, {} > = new Map();
    public defaultAssetSrc = '/assets/images/default_asset_logo.jpg';
    public $webAddAssetId: Subject < Balance > = new Subject();
    public $webDelAssetId: Subject < string > = new Subject();
    public assetRate: Map < string, {} > = new Map();
    public rateCurrency: string;

    constructor(
        private http: HttpService,
        private global: GlobalService,
        private chrome: ChromeService,
    ) {
        this.chrome.getAssetFile().subscribe(res => {
            this.assetFile = res;
        });
        this.chrome.getRateCurrency().subscribe(res => {
            this.rateCurrency = res;
            this.changeRateCurrency(res);
        });
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

    public popDelAssetId(): Observable < any > {
        return this.$webDelAssetId.pipe(publish(), refCount());
    }

    public pushAddAssetId(id) {
        this.$webAddAssetId.next(id);
    }

    public popAddAssetId(): Observable < any > {
        return this.$webAddAssetId.pipe(publish(), refCount());
    }

    public clearCache() {
        this.assetFile = new Map();
        this.assetRate = new Map();
    }

    public detail(address: string, id: string): Observable < Balance > {
        return this.fetchBalance(address).pipe(switchMap(balance => this.chrome.getWatch().pipe(map(watching => {
            return balance.find((e) => e.asset_id === id) || watching.find(w => w.asset_id === id);
        }))));
    }

    public fetchBalance(address: string): Observable < any > {
        return this.http.get(`${ this.global.apiDomain }/v1/address/assets?address=${ address }`);
    }

    public fetchAll(page: number): Promise < any > {
        return this.http.get(`${this.global.apiDomain}/v1/asset/getallassets?page_index=${page}`).toPromise();
    }

    public searchAsset(query: string): Observable < any > {
        return this.http.get(`${this.global.apiDomain}/v1/search?query=${query}`);
    }

    public getAssetSrc(assetId: string, lastModified: string): Observable < string > {
        return this.http.getImage(`${ this.global.apiDomain }/logo/${ assetId }`, lastModified);
    }

    public setAssetFile(res: any, assetId: string): Promise < any > {
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
    public getRate(query): Observable < any > {
        const target = this.global.formatQuery(query);
        return this.http.get(`${this.global.apiDomain}/v1/asset/exchange_rate${target}`);
    }

    public getAssetRate(coins: string): Observable < any > {
        if (!coins) {
            return of({});
        }
        coins = coins.toLowerCase();
        const coinsAry = coins.split(',');
        let rateRes = {};
        let targetCoins = '';
        coinsAry.forEach(element => {
            const tempAssetRate = this.assetRate.get(element);
            if (tempAssetRate) {
                rateRes[element] = tempAssetRate['rate'];
                if (new Date().getTime() / 1000 - tempAssetRate['last-modified'] > 1200) {
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
        let query = {};
        query['symbol'] = this.rateCurrency;
        query['coins'] = targetCoins;
        const target = this.global.formatQuery(query);
        return this.http.get(`${this.global.apiDomain}/v1/asset/exchange_rate${target}`).pipe(map(rateBalance => {
            const targetCoinsAry = targetCoins.split(',');
            targetCoinsAry.forEach(coin => {
                let tempRate = {};
                tempRate['last-modified'] = rateBalance['response_time'];
                if (coin in rateBalance.result) {
                    tempRate['rate'] = Number(rateBalance.result[coin]);
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
        }));
    }
}
