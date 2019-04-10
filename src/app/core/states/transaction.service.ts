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
    public $transferStatus: Subject < string > = new Subject();

    constructor(
        private http: HttpService,
        private global: GlobalService
    ) {}

    public pushTransferStatus(time) {
        this.$transferStatus.next(time);
    }

    public popTransferStatus(): Observable < any > {
        return this.$transferStatus.pipe(publish(), refCount());
    }

    public fetchTx(address: string, page: number, asset: string,
        max_id: number = -1, since_id: number = -1, abs_page: number = 1): Observable < any > {
        let url = `${this.global.apiDomain}/v1/transactions/getassettransactions?` +
            `address=${address}&asset_id=${asset}&page_size=10&abs_page=${abs_page}`;
        if (max_id !== -1) {
            url += `&max_id=${max_id}`;
        }
        if (since_id !== -1) {
            url += `&since_id=${since_id}`;

        }
        return this.http.get(url);
    }
}
