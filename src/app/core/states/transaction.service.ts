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
    PageData,
    Transaction
} from 'src/models/models';
import {
    Subject,
    Observable
} from 'rxjs';
import {
    startWith,
    publish,
    refCount,
    switchMap,
    map
} from 'rxjs/operators';

@Injectable()
export class TransactionState {
    private _address: string;
    private _data: PageData < Transaction > ;
    private $data: Subject < PageData < Transaction >> = new Subject();
    constructor(
        private http: HttpService,
        private global: GlobalService
    ) {}
    // public detail(id: string): Observable<Balance> {
    //     return this._balance ? of(this._balance.find((e) => e.asset_id == id)) : this.balance().pipe(map((res) => {
    //         return res.find((e) => e.asset_id == id);
    //     }));
    // }
    public clearCache() {
        this._address = undefined;
        this.$data = new Subject();
        this._data = null;
    }
    public data(): Observable < PageData < Transaction >> {
        return this._data ? this.$data.pipe(startWith(this._data), publish(), refCount()) : this.$data.pipe(publish(), refCount());
    }
    public fetch(address: string, page: number, asset: string,
        max_id: number = -1, since_id: number = -1, abs_page: number = 1): Observable < any > {
        let url = `${this.global.apiDomain}/v1/transactions/gettransactions?` +
            `address=${address}&asset_id=${asset}&page_size=10&abs_page=${abs_page}`;
        if (max_id !== -1) {
            url += `&max_id=${max_id}`;
        }
        if (since_id !== -1) {
            url += `&since_id=${since_id}`;

        }
        return this.http.get(url).pipe(map(res => {
            this._address = address;
            this._data = res;
            this._data.page = page;
            this.$data.next(res);
        }));
    }
}
