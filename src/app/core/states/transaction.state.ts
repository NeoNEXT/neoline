import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import { Observable, forkJoin, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { ChainType, RpcNetwork } from '@popup/_lib';
import { Transaction, NEO, GAS } from '@/models/models';
import BigNumber from 'bignumber.js';
import { UtilServiceState } from '../util/util.service';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';

@Injectable()
export class TransactionState {
  private chainType: ChainType;
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  constructor(
    private http: HttpService,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
    });
  }

  rpcSendRawTransaction(tx) {
    const data = {
      jsonrpc: '2.0',
      id: 1234,
      method: 'sendrawtransaction',
      params: [tx],
    };
    return this.http.rpcPost(this.n2Network.rpcUrl, data).toPromise();
  }

  async getAllTxs(address: string): Promise<Transaction[]> {
    if (this.chainType === 'NeoX') {
      return Promise.resolve([]);
    }
    if (this.chainType === 'Neo3') {
      return this.getN3AllTxs(address);
    }
    return this.getNeo2AllTxs(address);
  }

  async getAssetTxs(address: string, asset: string): Promise<Transaction[]> {
    if (this.chainType === 'NeoX') {
      return Promise.resolve([]);
    }
    if (this.chainType === 'Neo3') {
      return this.getN3AssetTxs(address, asset);
    }
    return this.getNeo2AssetTxs(address, asset);
  }

  getNeo2TxDetail(txid: string): Observable<any> {
    const data = {
      jsonrpc: '2.0',
      method: 'getrawtransaction',
      params: [txid, true],
      id: 1,
    };
    return this.http.rpcPost(this.n2Network.rpcUrl, data).pipe(
      map((res) => {
        return this.handleNeo2TxDetailResponse(res);
      })
    );
  }

  getTxsValid(txids: string[], chainType: ChainType): Observable<string[]> {
    const reqs = [];
    if (chainType === 'NeoX') return of(reqs);
    // neo2
    if (chainType === 'Neo2') {
      txids.forEach((txid) => {
        const data = {
          jsonrpc: '2.0',
          method: 'getrawtransaction',
          params: [txid, 1],
          id: 1,
        };
        const req = this.http.rpcPost(this.n2Network.rpcUrl, data);
        reqs.push(req);
      });
      return forkJoin(reqs).pipe(
        map((res: any[]) => {
          const result = [];
          (res || []).forEach((item) => {
            if (item?.blocktime) {
              result.push(item.txid);
            }
          });
          return result;
        })
      );
    }
    // neo3
    txids.forEach((txid) => {
      const data = {
        jsonrpc: '2.0',
        method: 'getrawtransaction',
        params: [txid, true],
        id: 1,
      };
      const req = this.http.rpcPost(this.n3Network.rpcUrl, data);
      reqs.push(req);
    });
    return forkJoin(reqs).pipe(
      map((res: any[]) => {
        const result = [];
        (res || []).forEach((item) => {
          if (item?.blocktime) {
            result.push(item.hash);
          }
        });
        return result;
      })
    );
  }

  //#region private function
  private async getNeo2AllTxs(address: string): Promise<Transaction[]> {
    const time = Math.floor(new Date().getTime() / 1000) - 30 * 24 * 3600;
    const data = {
      jsonrpc: '2.0',
      method: 'getnep5transfers',
      params: [address, time],
      id: 1,
    };
    let nep5Res = await this.http
      .rpcPost(this.n2Network.rpcUrl, data)
      .toPromise();
    let neoRes = await this.http
      .rpcPost(this.n2Network.rpcUrl, {
        ...data,
        method: 'getutxotransfers',
        params: [address, 'NEO', time],
      })
      .toPromise();
    let gasRes = await this.http
      .rpcPost(this.n2Network.rpcUrl, {
        ...data,
        method: 'getutxotransfers',
        params: [address, 'GAS', time],
      })
      .toPromise();
    neoRes = this.handleNeo2NativeTxResponse(neoRes);
    gasRes = this.handleNeo2NativeTxResponse(gasRes);
    nep5Res = await this.handleNeo2TxResponse(nep5Res);
    let n2Res = neoRes.concat(gasRes).concat(nep5Res);
    n2Res = n2Res.sort((a, b) => b.block_time - a.block_time);
    return n2Res;
  }
  private async getN3AllTxs(address: string): Promise<Transaction[]> {
    const time = Math.floor(new Date().getTime()) - 30 * 24 * 3600 * 1000;
    const data = {
      jsonrpc: '2.0',
      method: 'getnep17transfers',
      params: [address, time],
      id: 1,
    };
    let n3Res = await this.http
      .rpcPost(this.n3Network.rpcUrl, data)
      .toPromise();
    n3Res = await this.handleN3TxResponse(n3Res);
    n3Res = n3Res.sort((a, b) => b.block_time - a.block_time);
    return n3Res;
  }
  private async getNeo2AssetTxs(
    address: string,
    asset: string
  ): Promise<Transaction[]> {
    const time = Math.floor(new Date().getTime() / 1000) - 30 * 24 * 3600;
    const data = {
      jsonrpc: '2.0',
      method: 'getnep5transfers',
      params: [address, time],
      id: 1,
    };
    if (asset === NEO) {
      data.method = 'getutxotransfers';
      data.params = [address, 'NEO', time];
    }
    if (asset === GAS) {
      data.method = 'getutxotransfers';
      data.params = [address, 'GAS', time];
    }
    let res = await this.http.rpcPost(this.n2Network.rpcUrl, data).toPromise();
    if (asset === NEO || asset === GAS) {
      res = this.handleNeo2NativeTxResponse(res);
    } else {
      res.received = (res?.received || []).filter((item) =>
        asset.includes(item.asset_hash)
      );
      res.sent = (res?.sent || []).filter((item) =>
        asset.includes(item.asset_hash)
      );
      res = await this.handleNeo2TxResponse(res);
    }
    res = res.sort((a, b) => b.block_time - a.block_time);
    return res;
  }
  private async getN3AssetTxs(
    address: string,
    asset: string
  ): Promise<Transaction[]> {
    const res = await this.getAllTxs(address);
    return res.filter((item) => item.asset_id === asset);
  }
  private handleNeo2NativeTxResponse(data): Transaction[] {
    const target: Transaction[] = [];
    (data?.sent || []).forEach(({ asset, asset_hash, transactions }) => {
      transactions.forEach(({ timestamp, txid, amount, block_index }) => {
        target.push({
          value: `-${amount}`,
          txid,
          symbol: asset,
          asset_id: asset_hash,
          block_time: timestamp,
          type: 'sent',
          id: block_index,
        });
      });
    });
    (data?.received || []).forEach(({ asset, asset_hash, transactions }) => {
      transactions.forEach(({ timestamp, txid, amount, block_index }) => {
        target.push({
          value: amount,
          txid,
          symbol: asset,
          asset_id: asset_hash,
          block_time: timestamp,
          type: 'received',
          id: block_index,
        });
      });
    });
    target.sort((a, b) => a.txid.localeCompare(b.txid));
    for (let i = 1; i < target.length; ) {
      if (target[i].txid === target[i - 1].txid) {
        target[i].value = new BigNumber(target[i].value).plus(
          new BigNumber(target[i - 1].value)
        );
        target[i].type =
          target[i].value.comparedTo(0) > 0 ? 'received' : 'sent';
        target[i].value = target[i].value.toFixed();
        target.splice(i - 1, 1);
      } else {
        i++;
      }
    }
    return target;
  }
  private async handleNeo2TxResponse(data): Promise<Transaction[]> {
    const result: Transaction[] = [];
    const contracts: Set<string> = new Set();
    (data?.sent || []).forEach(
      ({
        amount,
        asset_hash,
        timestamp,
        transfer_address,
        tx_hash,
        block_index,
      }) => {
        contracts.add(asset_hash);
        result.push({
          asset_id: asset_hash,
          value: `-${amount}`,
          block_time: timestamp,
          txid: tx_hash,
          from: [data.address],
          to: [transfer_address],
          type: 'sent',
          id: block_index,
        });
      }
    );
    (data?.received || []).forEach(
      ({
        amount,
        asset_hash,
        timestamp,
        transfer_address,
        tx_hash,
        block_index,
      }) => {
        contracts.add(asset_hash);
        result.push({
          asset_id: asset_hash,
          value: amount,
          block_time: timestamp,
          txid: tx_hash,
          from: [transfer_address],
          to: [data.address],
          type: 'received',
          id: block_index,
        });
      }
    );
    // return of(result).toPromise();
    await this.util.getAssetSymbols(Array.from(contracts), 'Neo2');
    await this.util.getAssetDecimals(Array.from(contracts), 'Neo2');
    result.forEach((item, index) => {
      result[index].symbol = this.util.n2AssetSymbol.get(item.asset_id);
      const decimals = this.util.n2AssetDecimal.get(item.asset_id);
      result[index].value = new BigNumber(result[index].value)
        .shiftedBy(-decimals)
        .toFixed();
    });
    return result;
  }
  private async handleN3TxResponse(data): Promise<Transaction[]> {
    const result: Transaction[] = [];
    (data?.sent || []).forEach(
      ({
        timestamp,
        assethash,
        transferaddress,
        amount,
        txhash,
        blockindex,
      }) => {
        const txItem: Transaction = {
          block_time: Math.floor(timestamp / 1000),
          asset_id: assethash,
          from: [data.address],
          to: [transferaddress],
          value: `-${amount}`,
          txid: txhash,
          type: 'sent',
          id: blockindex,
        };
        result.push(txItem);
      }
    );
    (data?.received || []).forEach(
      ({
        timestamp,
        assethash,
        transferaddress,
        amount,
        txhash,
        blockindex,
      }) => {
        const txItem: Transaction = {
          block_time: Math.floor(timestamp / 1000),
          asset_id: assethash,
          from: [transferaddress],
          to: [data.address],
          value: amount,
          txid: txhash,
          type: 'received',
          id: blockindex,
        };
        result.push(txItem);
      }
    );
    // return of(result).toPromise();
    result.sort((a, b) => {
      if (a.txid.localeCompare(b.txid) === 0) {
        return a.asset_id.localeCompare(b.asset_id);
      } else {
        return a.txid.localeCompare(b.txid);
      }
    });
    for (let i = 1; i < result.length; ) {
      if (
        result[i].txid === result[i - 1].txid &&
        result[i].asset_id === result[i - 1].asset_id
      ) {
        result[i].value = new BigNumber(result[i].value).plus(
          new BigNumber(result[i - 1].value)
        );
        result[i].type =
          result[i].value.comparedTo(0) > 0 ? 'received' : 'sent';
        result[i].value = result[i].value.toFixed();
        result.splice(i - 1, 1);
      } else {
        i++;
      }
    }
    const contracts: Set<string> = new Set();
    result.forEach((item) => contracts.add(item.asset_id));
    await this.util.getAssetSymbols(Array.from(contracts), 'Neo3');
    await this.util.getAssetDecimals(Array.from(contracts), 'Neo3');
    result.forEach((item, index) => {
      result[index].symbol = this.util.n3AssetSymbol.get(item.asset_id);
      const decimals = this.util.n3AssetDecimal.get(item.asset_id);
      result[index].value = new BigNumber(result[index].value)
        .shiftedBy(-decimals)
        .toFixed();
    });
    return result;
  }
  private handleNeo2TxDetailResponse(data) {
    data.vin = data.vin.reduce((prev, element) => {
      if (!prev.find((item) => item === element.address)) {
        prev.push(element.address);
      }
      return prev;
    }, []);
    data.vout = data.vout.reduce((prev, element) => {
      if (!prev.find((item) => item === element.address)) {
        prev.push(element.address);
      }
      return prev;
    }, []);
    return data;
  }
  //#endregion
}
