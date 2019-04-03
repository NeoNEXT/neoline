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
    of ,
    from
} from 'rxjs';
import {
    PageData,
    Balance,
    Asset,
    defaultAssets
} from 'src/models/models';
import {
    map,
    refCount,
    publish,
    startWith,
    switchMap,
} from 'rxjs/operators';

@Injectable()
export class AssetState {
    private _address: string;
    private _balance: Balance[];
    private $balance: Subject < Balance[] > = new Subject();

    private _asset: PageData < Asset > ;
    private $asset: Subject < PageData < Asset >> = new Subject();
    public assetFile: Map < string, {} > = new Map();
    public defaultAssetSrc = '/assets/images/default_asset_logo.jpg';

    constructor(
        private http: HttpService,
        private global: GlobalService,
        private chrome: ChromeService,
    ) {
        this.chrome.getAssetFile().subscribe(res => {
            this.assetFile = res;
        });
    }

    public clearCache() {
        this._address = undefined;
        this.assetFile = new Map();
        this._balance = undefined;
        this.$balance = new Subject();
        this.$asset = new Subject();
        this._asset = null;
    }

    public detail(id: string): Observable < Balance > {
        return this.balance().pipe(switchMap((balance) => this.chrome.getWatch().pipe(map((watching => {
            return balance.find((e) => e.asset_id === id) || watching.find(w => w.asset_id === id);
        })))));
    }

    public balance(): Observable < Balance[] > {
        return this.$balance.pipe(publish(), refCount());
    }

    public fetchBalance(address: string) {
        return this.http.get(
            `${ this.global.apiDomain }/v1/address/assets?address=${ address }`
        ).toPromise().then((res) => {
            this._address = address;
            this._balance = res;
            defaultAssets.forEach(item => {
                if (this._balance.findIndex((e) => e.asset_id === item.asset_id) < 0) {
                    this._balance.unshift(item);
                }
            });
            this.$balance.next(res);
        });
    }

    public all(): Observable < PageData < Asset >> {
        return this.$asset.pipe(publish(), refCount());
    }

    public fetchAll(page: number) {
        return this.http.get(`${this.global.apiDomain}/v1/asset/getallassets?page_index=${page}`).toPromise().then((res) => {
            if (res !== this._asset) {
                this._asset = res;
                this.$asset.next(res);
            }
        });
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
}
