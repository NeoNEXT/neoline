import { Injectable } from '@angular/core';
import { HttpService } from '../../services/http.service';
import { NftAsset, NftTransaction } from '@/models/models';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { RpcNetwork } from '@/app/popup/_lib';
import { NeoAssetInfoState } from './asset-info.state';

@Injectable()
export class NftState {
  private n3Network: RpcNetwork;
  constructor(
    private http: HttpService,
    private neoAssetInfoState: NeoAssetInfoState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
    });
  }

  async getAddressNfts(address: string): Promise<NftAsset[]> {
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getnep11balances',
      params: [address],
    };
    const res = await this.http
      .rpcPost(this.n3Network.rpcUrl, data)
      .toPromise();
    return res.balance;
  }

  async getNftTokens(address: string, contract: string): Promise<NftAsset> {
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getnep11balances',
      params: [address],
    };
    const res = await this.http
      .rpcPost(this.n3Network.rpcUrl, data)
      .toPromise();
    const nftAsset: NftAsset = res.balance.find(
      (m) => m.assethash === contract
    );
    if (!nftAsset) {
      return undefined;
    }
    const tokenIds = [];
    nftAsset.tokens.forEach((m, index) => {
      nftAsset.tokens[index].symbol = nftAsset.symbol;
      tokenIds.push(m.tokenid);
    });
    const propertiesRes = await this.neoAssetInfoState.getN3NftProperties(
      nftAsset.assethash,
      tokenIds
    );
    propertiesRes.forEach((m, index) => {
      nftAsset.tokens[index].image_url = m.image;
      nftAsset.tokens[index].name = m.name;
    });
    return nftAsset;
  }

  async getNftTransactions(
    address: string,
    contract: string
  ): Promise<NftTransaction[]> {
    const time = Math.floor(new Date().getTime()) - 30 * 24 * 3600 * 1000;
    const data = {
      jsonrpc: '2.0',
      method: 'getnep11transfers',
      params: [address, time],
      id: 1,
    };
    let n3Res = await this.http
      .rpcPost(this.n3Network.rpcUrl, data)
      .toPromise();
    n3Res = await this.handleNftTxResponse(n3Res, contract);
    n3Res = n3Res.sort((a, b) => b.block_time - a.block_time);
    return n3Res;
  }

  private async handleNftTxResponse(
    data,
    contract: string
  ): Promise<NftTransaction[]> {
    const result: NftTransaction[] = [];
    (data?.sent || []).forEach(
      ({
        timestamp,
        assethash,
        transferaddress,
        amount,
        txhash,
        blockindex,
        tokenid,
      }) => {
        if (assethash !== contract) {
          return;
        }
        const txItem: NftTransaction = {
          block_time: Math.floor(timestamp / 1000),
          asset_id: assethash,
          from: [data.address],
          to: [transferaddress],
          value: `-${amount}`,
          txid: txhash,
          type: 'sent',
          id: blockindex,
          tokenid,
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
        tokenid,
      }) => {
        if (assethash !== contract) {
          return;
        }
        const txItem: NftTransaction = {
          block_time: Math.floor(timestamp / 1000),
          asset_id: assethash,
          from: [transferaddress],
          to: [data.address],
          value: amount,
          txid: txhash,
          type: 'received',
          id: blockindex,
          tokenid,
        };
        result.push(txItem);
      }
    );
    return result;
  }

  public async searchNft(q: string): Promise<NftAsset> {
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getcontractstate',
      params: [q],
    };
    const res = await this.http
      .rpcPost(this.n3Network.rpcUrl, data)
      .toPromise();
    if ((res?.manifest?.supportedstandards || []).includes('NEP-11')) {
      const symbols = await this.neoAssetInfoState.getAssetSymbols([res?.hash], 'Neo3');
      const target: NftAsset = {
        name: res?.manifest.name,
        assethash: res?.hash,
        symbol: symbols[0],
      };
      return target;
    } else {
      throw null;
    }
  }
}
