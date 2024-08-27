import { Injectable } from '@angular/core';
import { HttpService } from './http.service';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';
import { ChainType } from '@/app/popup/_lib';

@Injectable()
export class HomeService {
  loading = false;
  showClaim = false;
  claimNumber = 0;
  claimGasHash: string;
  claimTxTime;

  private n3Network;
  constructor(private http: HttpService, private store: Store<AppState>) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
    });
  }

  getN3RawTransaction(txHash: string) {
    const data = {
      jsonrpc: '2.0',
      id: 1234,
      method: 'getrawtransaction',
      params: [txHash, true],
    };
    const rpcHost = this.n3Network.rpcUrl;
    return this.http.rpcPost(rpcHost, data).toPromise();
  }

  getRpcUrlMessage(rpcUrl: string, chainType: ChainType): Observable<any> {
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: chainType === 'Neo3' ? 'getversion' : 'eth_chainId',
      params: [],
    };
    return this.http.rpcPost(rpcUrl, data).pipe(
      map((res) => {
        return res;
      })
    );
  }
}
