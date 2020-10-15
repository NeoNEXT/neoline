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
    public txSource = new Subject();
    public txSub$ = this.txSource.asObservable();

    constructor(
        private http: HttpService,
        private global: GlobalService
    ) { }

    public pushTxSource() {
        this.txSource.next('new');
    }

    public fetchTx(address: string, page: number, asset: string,
        maxId: number = -1): Observable<any> {
        let url = `${this.global.apiGoDomain}/v1/neo2/transactions/${address}/${asset}` +
            `?count=10`;
        if (maxId !== -1) {
            url += `&max_id=${maxId}`;
        }
        return this.http.get(url);
    }

    public getAllTx(address: string, maxId: number = -1,): Observable<any> {
        let url = `${this.global.apiGoDomain}/v1/neo2/address/transactions/all?` +
            `address=${address}&count=10`;
        if (maxId !== -1) {
            url += `&max_id=${maxId - 1}`;
        }
        return this.http.get(url);
    }


    getTxDetail(txid: string): Observable<any> {
        return this.http.get(`${this.global.apiGoDomain}/v1/neo2/transaction/${txid}`)
    }
}
