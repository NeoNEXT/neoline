import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, timeout, catchError, retry } from 'rxjs/operators';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import {
  N2MainnetNetwork,
  N3MainnetNetwork,
  RpcNetwork,
} from '@/app/popup/_lib';

@Injectable()
export class HttpService {
  private network: RpcNetwork;
  constructor(private http: HttpClient, private store: Store<AppState>) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      const chainType = state.currentChainType;
      this.network =
        chainType === 'Neo2'
          ? state.n2Networks[state.n2NetworkIndex]
          : state.n3Networks[state.n3NetworkIndex];
    });
  }

  public get(url: string): Observable<any> {
    let networkStr = 'testnet';
    if (
      this.network.chainId === N2MainnetNetwork.chainId ||
      this.network.chainId === N3MainnetNetwork.chainId
    ) {
      networkStr = 'mainnet';
    }
    return this.http.get(url, { headers: { Network: networkStr } }).pipe(
      map((res: any) => {
        if (res && res.status === 'success') {
          return res.data;
        } else {
          throw (res && res.msg) || res;
        }
      })
    );
  }

  public rpcPostReturnAllData(url: string, data: any): Observable<any> {
    return this.http.post(url, data).pipe(
      timeout(5000),
      retry(3),
      catchError(() => of('Request timed out')),
      map((res: any) => {
        if (res === 'Request timed out') {
          throw { message: res };
        }
        return res;
      })
    );
  }

  public rpcPost(url: string, data: any): Observable<any> {
    return this.http.post(url, data).pipe(
      timeout(5000),
      retry(3),
      catchError(() => of('Request timed out')),
      map((res: any) => {
        if (res === 'Request timed out') {
          throw { message: res };
        }
        if (res && res.hasOwnProperty('result')) {
          return res.result;
        } else if (res && res.hasOwnProperty('error')) {
          throw res.error;
        } else {
          throw res;
        }
      })
    );
  }
}
