import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { map, timeout, catchError, retry } from 'rxjs/operators';
import { ChromeService } from './chrome.service';
import { NeonService } from './neon.service';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { ChainType, RpcNetwork } from '@/app/popup/_lib';

@Injectable()
export class HttpService {
  private network: RpcNetwork;
  constructor(
    private http: HttpClient,
    private chrome: ChromeService,
    private neon: NeonService,
    private store: Store<AppState>
  ) {
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
    if (this.network.chainId === 1 || this.network.chainId === 3) {
      networkStr = 'mainnet';
    }
    if (this.chrome.check) {
      return from(
        new Promise((resolve, reject) => {
          this.chrome.httpGet(
            url,
            (res) => {
              if (res.status === 'success') {
                resolve(res.data);
              } else {
                reject((res && res.msg) || res);
              }
            },
            {
              Network: networkStr,
            }
          );
        })
      );
    }
    return this.http
      .get(url, {
        headers: {
          Network: networkStr,
        },
      })
      .pipe(
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
      catchError(() => of('Request timed out')),
      map((res: any) => {
        if (res === 'Request timed out') {
          this.neon.getFastRpcUrl(true);
          throw 'Error!';
        }
        return res;
      })
      // retry(3)
    );
  }

  public rpcPost(url: string, data: any): Observable<any> {
    return this.http.post(url, data).pipe(
      timeout(5000),
      catchError(() => of('Request timed out')),
      map((res: any) => {
        if (res === 'Request timed out') {
          this.neon.getFastRpcUrl(true);
          throw 'Error!';
        }
        if (res && res.result) {
          return res.result;
        } else {
          throw res.error;
        }
      })
      // retry(3)
    );
  }

  public n3RpcPost(url: string, data: any): Observable<any> {
    return this.http.post(url, data).pipe(
      timeout(5000),
      catchError(() => of(`Request timed out`)),
      map((res: any) => {
        if (res === 'Request timed out') {
          this.neon.getFastRpcUrl(true);
          throw 'Error!';
        }
        if (res && res.result) {
          return res.result;
        } else if (res && res.error) {
          return res.error;
        } else {
          throw res;
        }
      })
      // retry(3)
    );
  }
}
