import { Injectable } from '@angular/core';
import { HttpService } from '../services/http.service';
import {
  ChainType,
  DEFAULT_NEO2_ASSETS,
  NEO3_CONTRACT,
  GAS3_CONTRACT,
  DEFAULT_NEO3_ASSETS,
  RpcNetwork,
  N3ContractManifest,
} from '@/app/popup/_lib';
import { NEO, GAS } from '@/models/models';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import {
  handleNeo3StackNumberValue,
  handleNeo3StackStringValue,
} from '../utils/neo';
import { map, Observable, of } from 'rxjs';

@Injectable()
export class NeoAssetInfoState {
  public n2AssetSymbol: Map<string, string> = new Map();
  public n2AssetDecimal: Map<string, number> = new Map();
  public n3AssetSymbol: Map<string, string> = new Map();
  public n3AssetDecimal: Map<string, number> = new Map();
  public n3AssetName: Map<string, string> = new Map();
  private n3ContractInfo: Map<string, N3ContractManifest> = new Map();
  public n3NftProperties = {};

  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  constructor(private http: HttpService, private store: Store<AppState>) {
    this.n2AssetDecimal.set(NEO, DEFAULT_NEO2_ASSETS.NEO.decimals);
    this.n2AssetSymbol.set(NEO, DEFAULT_NEO2_ASSETS.NEO.symbol);
    this.n2AssetDecimal.set(GAS, DEFAULT_NEO2_ASSETS.GAS.decimals);
    this.n2AssetSymbol.set(GAS, DEFAULT_NEO2_ASSETS.GAS.symbol);
    this.n3AssetDecimal.set(NEO3_CONTRACT, DEFAULT_NEO3_ASSETS.NEO.decimals);
    this.n3AssetSymbol.set(NEO3_CONTRACT, DEFAULT_NEO3_ASSETS.NEO.symbol);
    this.n3AssetDecimal.set(GAS3_CONTRACT, DEFAULT_NEO3_ASSETS.GAS.decimals);
    this.n3AssetSymbol.set(GAS3_CONTRACT, DEFAULT_NEO3_ASSETS.GAS.symbol);
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
    });
  }

  getAssetSymbols(
    contracts: string[],
    chainType: ChainType
  ): Promise<string[]> {
    const rpcUrl =
      chainType === 'Neo2' ? this.n2Network.rpcUrl : this.n3Network.rpcUrl;
    const requestDatas = [];
    const requestIndexs = [];
    const symbolsRes = [];
    contracts.forEach((assetId, index) => {
      if (chainType === 'Neo2' && this.n2AssetSymbol.has(assetId)) {
        symbolsRes[index] = this.n2AssetSymbol.get(assetId);
      } else if (chainType === 'Neo3' && this.n3AssetSymbol.has(assetId)) {
        symbolsRes[index] = this.n3AssetSymbol.get(assetId);
      } else {
        const data = {
          jsonrpc: '2.0',
          id: 1,
          method: 'invokefunction',
          params: [assetId, 'symbol'],
        };
        requestIndexs.push(index);
        requestDatas.push(data);
      }
    });
    if (requestDatas.length === 0) {
      return Promise.resolve(symbolsRes);
    }
    return this.http
      .rpcPostReturnAllData(rpcUrl, requestDatas)
      .toPromise()
      .then((res) => {
        res.forEach((item, index) => {
          const symbol = handleNeo3StackStringValue(item.result);
          const sourceIndex = requestIndexs[index];
          if (chainType === 'Neo2') {
            this.n2AssetSymbol.set(contracts[sourceIndex], symbol);
          } else {
            this.n3AssetSymbol.set(contracts[sourceIndex], symbol);
          }
          symbolsRes[sourceIndex] = symbol;
        });
        return symbolsRes;
      });
  }

  getAssetDecimals(
    contracts: string[],
    chainType: ChainType
  ): Promise<number[]> {
    const rpcUrl =
      chainType === 'Neo2' ? this.n2Network.rpcUrl : this.n3Network.rpcUrl;
    const requestDatas = [];
    const requestIndexs = [];
    const decoimalsRes = [];
    contracts.forEach((assetId, index) => {
      if (chainType === 'Neo2' && this.n2AssetDecimal.has(assetId)) {
        decoimalsRes[index] = this.n2AssetDecimal.get(assetId);
      } else if (chainType === 'Neo3' && this.n3AssetDecimal.has(assetId)) {
        decoimalsRes[index] = this.n3AssetDecimal.get(assetId);
      } else {
        const data = {
          jsonrpc: '2.0',
          id: 1,
          method: 'invokefunction',
          params: [assetId, 'decimals'],
        };
        requestIndexs.push(index);
        requestDatas.push(data);
      }
    });
    if (requestDatas.length === 0) {
      return Promise.resolve(decoimalsRes);
    }
    return this.http
      .rpcPostReturnAllData(rpcUrl, requestDatas)
      .toPromise()
      .then((res) => {
        res.forEach((item, index) => {
          const decimal = handleNeo3StackNumberValue(item.result);
          const sourceIndex = requestIndexs[index];
          if (chainType === 'Neo2') {
            this.n2AssetDecimal.set(contracts[sourceIndex], decimal);
          } else {
            this.n3AssetDecimal.set(contracts[sourceIndex], decimal);
          }
          decoimalsRes[sourceIndex] = decimal;
        });
        return decoimalsRes;
      });
  }

  getN3NftNames(contracts: string[]): Promise<string[]> {
    const requestDatas = [];
    const requestIndexs = [];
    const namesRes = [];
    contracts.forEach((assetId, index) => {
      if (this.n3AssetName.has(assetId)) {
        namesRes[index] = this.n3AssetName.get(assetId);
      } else {
        const data = {
          jsonrpc: '2.0',
          id: 1,
          method: 'getcontractstate',
          params: [assetId],
        };
        requestDatas.push(data);
        requestIndexs.push(index);
      }
    });
    if (requestDatas.length === 0) {
      return Promise.resolve(namesRes);
    }
    this.http
      .rpcPostReturnAllData(this.n3Network.rpcUrl, requestDatas)
      .toPromise()
      .then((res) => {
        res.forEach((item, index) => {
          let name = '';
          if (item.result?.manifest?.name) {
            name = item.result.manifest.name;
          }
          const sourceIndex = requestIndexs[index];
          this.n3AssetName.set(contracts[sourceIndex], name);
          namesRes[sourceIndex] = name;
        });
        return namesRes;
      });
  }

  getN3NftProperties(contract: string, tokenids: string[]): Promise<any[]> {
    if (!this.n3NftProperties[contract]) {
      this.n3NftProperties[contract] = {};
    }
    const requestData = [];
    const requestIndexs = [];
    const propertiesRes = [];
    tokenids.forEach((id, index) => {
      if (this.n3NftProperties[contract][id]) {
        propertiesRes[index] = this.n3NftProperties[contract][id];
      } else {
        const data = {
          jsonrpc: '2.0',
          id: 1,
          method: 'getnep11properties',
          params: [contract, id],
        };
        requestData.push(data);
        requestIndexs.push(index);
      }
    });
    if (requestData.length === 0) {
      return Promise.resolve(propertiesRes);
    }
    return this.http
      .rpcPostReturnAllData(this.n3Network.rpcUrl, requestData)
      .toPromise()
      .then((res) => {
        res.forEach((item, index) => {
          const properties = {
            name: item?.result?.name || '',
            image: item?.result?.image || '',
          };
          const tokenIdIndex = requestIndexs[index];
          this.n3NftProperties[contract][tokenids[tokenIdIndex]] = properties;
          propertiesRes[tokenIdIndex] = properties;
        });
        return propertiesRes;
      });
  }

  getContractManifests(contracts: string[]): Observable<N3ContractManifest[]> {
    const requestDatas = [];
    const requestIndexs = [];
    const contractInfoRes = [];
    contracts.forEach((hash, index) => {
      if (this.n3ContractInfo.has(hash)) {
        contractInfoRes[index] = this.n3ContractInfo.get(hash);
      } else {
        const data = {
          jsonrpc: '2.0',
          id: 1,
          method: 'getcontractstate',
          params: [hash],
        };
        requestDatas.push(data);
        requestIndexs.push(index);
      }
    });
    if (requestDatas.length === 0) {
      return of(contractInfoRes);
    }
    return this.http
      .rpcPostReturnAllData(this.n3Network.rpcUrl, requestDatas)
      .pipe(
        map((res) => {
          res.forEach((item, index) => {
            let info: N3ContractManifest;
            if (item.result?.manifest) {
              info = item.result.manifest;
            }
            const sourceIndex = requestIndexs[index];
            this.n3ContractInfo.set(contracts[sourceIndex], info);
            contractInfoRes[sourceIndex] = info;
          });
          return contractInfoRes;
        })
      );
  }
}
