import { Injectable } from '@angular/core';
import { HttpService } from '../http.service';
import { Observable, of, from, forkJoin } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { map } from 'rxjs/operators';
import { GasFeeSpeed, RpcNetwork } from '@popup/_lib/type';
import { bignumber } from 'mathjs';
import { ChainType } from '@popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { environment } from '@/environments/environment';
import { ClaimItem } from 'src/models/models';
import { tx as tx2, rpc } from '@cityofzion/neon-js';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Transaction } from '@cityofzion/neon-core/lib/tx';
import { GlobalService } from '../global.service';
import { ChromeService } from '../chrome.service';

@Injectable()
export class NeoGasService {
  private apiDomain: string;

  private allNeoGasFeeSpeed: { [key: string]: GasFeeSpeed } = {};
  private gasFeeDefaultSpeed: GasFeeSpeed = {
    slow_price: '0',
    propose_price: '0.011',
    fast_price: '0.2',
  };

  private chainType: ChainType;
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  private neo2WIFArr: string[];
  private neo2WalletArr: Wallet2[];

  constructor(
    private http: HttpService,
    private store: Store<AppState>,
    private global: GlobalService,
    private chrome: ChromeService
  ) {
    this.apiDomain = environment.mainApiBase;
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo2WIFArr = state.neo2WIFArr;
    });
  }

  //#region claim
  // neo2
  public fetchClaim(address: string): Observable<any> {
    const getClaimable = from(
      rpc.Query.getClaimable(address).execute(this.n2Network.rpcUrl)
    );
    const getUnclaimed = from(
      rpc.Query.getUnclaimed(address).execute(this.n2Network.rpcUrl)
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
  public async claimNeo2GAS(
    claims: Array<ClaimItem>,
    currentWallet: Wallet2
  ): Promise<Array<Transaction>> {
    const claimArr = [[]];
    const valueArr = [];
    let count = 0;
    let txCount = 0;
    let itemValue = 0;
    claims.forEach((item) => {
      count++;
      claimArr[txCount].push({
        prevHash: item.txid.length === 66 ? item.txid.slice(2) : item.txid,
        prevIndex: item.n,
      });
      itemValue = this.global.mathAdd(itemValue, Number(item.unclaimed));
      if (count >= 20) {
        txCount++;
        count = 0;
        claimArr[txCount] = [];
        valueArr.push(itemValue);
        itemValue = 0;
      }
    });
    if (itemValue !== 0) {
      valueArr.push(itemValue);
    }
    let wif =
      this.neo2WIFArr[
        this.neo2WalletArr.findIndex(
          (item) =>
            item.accounts[0].address === currentWallet.accounts[0].address
        )
      ];
    if (!wif && !currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      const pwd = await this.chrome.getPassword();
      wif = (await (currentWallet.accounts[0] as any).decrypt(pwd)).WIF;
    }
    const txArr = [];
    claimArr.forEach((item, index) => {
      const newTx = new tx2.ClaimTransaction({
        claims: item,
      });
      newTx.addIntent(
        'GAS',
        valueArr[index],
        currentWallet.accounts[0].address
      );
      wif && newTx.sign(wif);
      txArr.push(newTx);
    });
    return txArr;
  }
  //neo3
  public getUnclaimedGas(address: string): Observable<any> {
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getunclaimedgas',
      params: [address],
    };
    return this.http.rpcPost(this.n3Network.rpcUrl, data);
  }
  //#endregion

  getGasFee(): Observable<GasFeeSpeed> {
    if (this.chainType === 'NeoX') return of(null);
    if (this.chainType === 'Neo3') {
      if (this.allNeoGasFeeSpeed[this.n3Network.network]) {
        return of(this.allNeoGasFeeSpeed[this.n3Network.network]);
      }
      return this.fetchNeo3GasFee();
    }
    if (this.allNeoGasFeeSpeed[this.n2Network.network]) {
      return of(this.allNeoGasFeeSpeed[this.n2Network.network]);
    }
    return this.http.get(`${this.apiDomain}/v1/neo2/fees`).pipe(
      map((res: any) => {
        if (res) {
          this.allNeoGasFeeSpeed[this.n2Network.network] = res;
        }
        return res || this.gasFeeDefaultSpeed;
      }),
      catchError(() => of(this.gasFeeDefaultSpeed))
    );
  }

  private fetchNeo3GasFee(): Observable<any> {
    return this.http.get(`${this.apiDomain}/v1/neo3/fees`).pipe(
      map((res: any) => {
        if (res) {
          res.slow_price = bignumber(res.slow_price)
            .dividedBy(bignumber(10).pow(8))
            .toFixed();
          res.propose_price = bignumber(res.propose_price)
            .dividedBy(bignumber(10).pow(8))
            .toFixed();
          res.fast_price = bignumber(res.fast_price)
            .dividedBy(bignumber(10).pow(8))
            .toFixed();
          this.allNeoGasFeeSpeed[this.n3Network.network] = res;
        }
        return res || this.gasFeeDefaultSpeed;
      }),
      catchError(() => of(this.gasFeeDefaultSpeed))
    );
  }
}
