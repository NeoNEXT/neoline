import { Injectable } from '@angular/core';
import { wallet, u } from '@cityofzion/neon-core-neo3';
import { wallet as walletPr5 } from '@cityofzion/neon-core-neo3-pr5';
import { wallet as walletRc1 } from '@cityofzion/neon-core-neo3-rc1';
import {
  base642hex,
  hex2base64,
  hexstring2str,
} from '@cityofzion/neon-core-neo3/lib/u';
import { HttpService } from '../services/http.service';
import {
  ChainType,
  DEFAULT_NEO2_ASSETS,
  NEO3_CONTRACT,
  GAS3_CONTRACT,
  DEFAULT_NEO3_ASSETS,
  NNS_CONTRACT,
  RpcNetwork,
} from '@/app/popup/_lib';
import { map } from 'rxjs/operators';
import BigNumber from 'bignumber.js';
import { NEO, GAS } from '@/models/models';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { ChromeService } from '../services/chrome.service';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { ethers } from 'ethers';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { PopupAddNetworkDialogComponent } from '@/app/popup/_dialogs';

@Injectable()
export class UtilServiceState {
  public n2AssetSymbol: Map<string, string> = new Map();
  public n2AssetDecimal: Map<string, number> = new Map();
  public n3AssetSymbol: Map<string, string> = new Map();
  public n3AssetDecimal: Map<string, number> = new Map();
  public n3AssetName: Map<string, string> = new Map();
  public n3NftProperties = {};

  private currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  constructor(
    private http: HttpService,
    private router: Router,
    private dialog: MatDialog,
    private store: Store<AppState>,
    private chrome: ChromeService
  ) {
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
      this.currentWallet = state.currentWallet;
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
    });
  }

  detectContractSecurity(chainId: number, address: string) {
    window.open(`https://gopluslabs.io/token-security/${chainId}/${address}`);
  }

  toExplorer({
    chain,
    network,
    networkIndex,
    type,
    value,
  }: {
    chain: ChainType;
    network: RpcNetwork;
    networkIndex: number;
    type: 'account' | 'token' | 'NFT' | 'tx';
    value: string;
  }) {
    let openEditDialog = false;
    const explorer = network?.explorer.endsWith('/')
      ? network.explorer.slice(0, -1)
      : network.explorer;
    switch (chain) {
      case 'Neo2':
        if (explorer) {
          if (type === 'account') {
            window.open(`${explorer}/address/${value}/page/1`);
          } else if (type === 'tx') {
            window.open(`${explorer}/transaction/${value}`);
          } else if (type === 'token') {
            const isNep5 = value !== NEO && value !== GAS;
            window.open(
              `${explorer}/${isNep5 ? 'nep5' : 'asset'}/${value}/page/1`
            );
          }
        }
        break;
      case 'Neo3':
        if (explorer) {
          if (type === 'account') {
            window.open(`${explorer}/address/${value}`);
          } else if (type === 'tx') {
            window.open(`${explorer}/transaction/${value}`);
          } else if (type === 'token') {
            window.open(`${explorer}/tokens/nep17/${value}`);
          } else if (type === 'NFT') {
            window.open(`${explorer}/tokens/nft/${value}`);
          }
        } else {
          openEditDialog = true;
        }
        break;
      case 'NeoX':
        if (explorer) {
          if (type === 'account') {
            window.open(`${explorer}/address/${value}`);
          } else if (type === 'tx') {
            window.open(`${explorer}/tx/${value}`);
          } else if (type === 'token' || type === 'NFT') {
            window.open(`${explorer}/token/${value}`);
          }
        } else {
          openEditDialog = true;
        }
        break;
    }
    if (openEditDialog) {
      this.dialog.open(PopupAddNetworkDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
        data: {
          addChainType: chain,
          index: networkIndex,
          editNetwork: network,
          addExplorer: true,
        },
      });
    }
  }

  checkNeedRedirectHome() {
    const noNeedRedirectUrl = [
      '/popup/about',
      '/popup/setting',
      '/popup/wallet',
      '/popup/account',
      '/popup/address-book',
      '/popup/transfer/receive',
      '/popup/one-password',
    ];
    if (
      noNeedRedirectUrl.findIndex((item) => location.hash.includes(item)) < 0
    ) {
      this.router.navigateByUrl('/popup/home');
    }
  }

  getHexDataLength(henData: string) {
    if (!henData) return;
    let value = henData.startsWith('0x') ? henData.substring(2) : henData;
    if (value.length >= 2 && value.length % 2 === 0) {
      return value.length / 2;
    }
    return 0;
  }

  parseUrl(url: string): any {
    const query = url.slice(url.indexOf('?') + 1);
    const pairs = query.split('&');
    const target = {};
    pairs.forEach((p) => {
      const temp = p.split('=');
      target[temp[0]] = decodeURIComponent(temp[1]);
    });
    return target;
  }

  getNeo3Account(sourceAccount?) {
    const account = sourceAccount ?? this.currentWallet.accounts[0];
    const accountJson = account.export();
    const index = this.neo3WalletArr.findIndex(
      (item) => item.accounts[0].address === account.address
    );
    const wif = this.neo3WIFArr[index];
    if (!wif) {
      return account;
    }
    const preview5Account = new walletPr5.Account(
      walletPr5.getPrivateKeyFromWIF(wif)
    );
    const rc1Account = new walletRc1.Account(
      walletRc1.getPrivateKeyFromWIF(wif)
    );
    const latestAccount = new wallet.Account(wallet.getPrivateKeyFromWIF(wif));
    // console.log('account: ');
    // console.log(account);
    // console.log('preview5Account: ');
    // console.log(preview5Account);
    // console.log('rc1Account: ');
    // console.log(rc1Account);
    // console.log('latestAccount: ');
    // console.log(latestAccount);

    // console.log(account.contract.script);
    // console.log(preview5Account.contract.script); // hex
    // console.log(base642hex(rc1Account.contract.script)); // base64
    // console.log(base642hex(latestAccount.contract.script)); // base64

    if (accountJson.address === latestAccount.address) {
      if (
        account.contract.script ===
          hex2base64(preview5Account.contract.script) ||
        account.contract.script === preview5Account.contract.script
      ) {
        accountJson.address = preview5Account.address;
        accountJson.label = preview5Account.label;
        const temp = new walletPr5.Account(accountJson);
        return temp;
      }
      if (
        account.contract.script === base642hex(rc1Account.contract.script) ||
        account.contract.script === rc1Account.contract.script
      ) {
        accountJson.address = rc1Account.address;
        accountJson.label = rc1Account.label;
        const temp = new walletRc1.Account(accountJson);
        return temp;
      }
    }
    return account;
  }

  n3InvokeScript(script, signers) {
    const data = {
      jsonrpc: '2.0',
      id: 1234,
      method: 'invokescript',
      params: [script, signers],
    };
    return this.http.n3RpcPost(this.n3Network.rpcUrl, data).toPromise();
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
          const symbol = this.handleNeo3StackStringValue(item.result);
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
          const decimal = this.handleNeo3StackNumberValue(item.result);
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

  handleNeo3StackNumberValue(result): number {
    let res = 0;
    if (result.state === 'HALT' && result.stack?.[0]?.value) {
      res = result.stack[0].value;
      if (result.stack[0].type === 'Integer') {
        res = Number(result.stack[0].value || 0);
      }
      if (result.stack[0].type === 'ByteArray') {
        const hexStr = u.reverseHex(result.stack[0].value);
        res = new BigNumber(hexStr || 0, 16).toNumber();
      }
    }
    return res;
  }

  handleNeo3StackNumber(result): string {
    let res;
    if (result.type === 'Integer') {
      res = result.value;
    }
    if (result.type === 'ByteArray') {
      const hexStr = u.reverseHex(result.value);
      res = new BigNumber(hexStr || 0, 16).toFixed();
    }
    return res;
  }

  handleNeo3StackStringValue(result): string {
    let res = '';
    if (result.state === 'HALT' && result.stack?.[0]?.value) {
      res = result.stack[0].value;
      if (result.stack[0].type === 'ByteArray') {
        res = hexstring2str(result.stack[0].value);
      }
      if (result.stack[0].type === 'ByteString') {
        res = hexstring2str(base642hex(result.stack[0].value));
      }
    }
    return res;
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

  getN3NnsAddress(domain: string, chainId: number) {
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'invokefunction',
      params: [
        NNS_CONTRACT[chainId],
        'resolve',
        [
          {
            type: 'String',
            value: domain,
          },
          {
            type: 'Integer',
            value: '16',
          },
        ],
      ],
    };
    return this.http.rpcPost(this.n3Network.rpcUrl, data).pipe(
      map((res) => {
        return this.handleNeo3StackStringValue(res);
      })
    );
  }

  async getWIF(
    WIFArr: string[],
    walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>,
    currentWallet: Wallet2 | Wallet3 | EvmWalletJSON
  ): Promise<string> {
    const index = walletArr.findIndex(
      (item) => item.accounts[0].address === currentWallet.accounts[0].address
    );
    const wif = WIFArr[index];
    if (wif) {
      return wif;
    }
    if (currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      return '';
    }
    const pwd = await this.chrome.getPassword();
    if (ethers.isAddress(currentWallet.accounts[0].address)) {
      return ethers.Wallet.fromEncryptedJson(
        JSON.stringify(currentWallet),
        pwd
      ).then((wallet) => {
        return wallet.privateKey;
      });
    }
    return (currentWallet.accounts[0] as any).decrypt(pwd).then((res) => {
      return res.WIF;
    });
  }
}
