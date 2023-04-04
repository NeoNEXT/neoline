import { Injectable } from '@angular/core';
import Neon2, {
  wallet as wallet2,
  tx as tx2,
  rpc as rpc2,
} from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Observable, from, Observer, of, forkJoin } from 'rxjs';
import { map, catchError, timeout } from 'rxjs/operators';
import { ChromeService } from './chrome.service';
import { GlobalService } from './global.service';
import { Transaction, TransactionInput } from '@cityofzion/neon-core/lib/tx';
import { UTXO, ClaimItem, GAS } from '@/models/models';
import { Fixed8 } from '@cityofzion/neon-core/lib/u';
import { sc, u } from '@cityofzion/neon-core';
import { EVENT, TxHashAttribute } from '@/models/dapi';
import { bignumber } from 'mathjs';
import {
  ChainType,
  STORAGE_NAME,
  INIT_ACCOUNT,
  UPDATE_NEO3_NETWORKS,
  UPDATE_NEO3_NETWORK_INDEX,
  UPDATE_WALLET,
  RpcNetwork,
  UPDATE_NEO2_NETWORKS,
  REMOVE_NEO2_WALLET,
  REMOVE_NEO3_WALLET,
  UPDATE_NEO3_WALLETS_ADDRESS,
} from '@popup/_lib';
import { str2hexstring } from '@cityofzion/neon-core-neo3/lib/u';
import { HttpClient } from '@angular/common/http';
import { AppState } from '@/app/reduers';
import { Store } from '@ngrx/store';

@Injectable()
export class NeonService {
  selectedChainType: ChainType = 'Neo3';
  private hasGetFastRpc = false;
  private loadingGetFastRpc = false;

  private currentWallet: Wallet2 | Wallet3;
  private currentChainType: ChainType;
  private neo2WalletArr: Wallet2[];
  private neo3WalletArr: Wallet3[];
  private neo2WIFArr: string[];
  private n2Networks: RpcNetwork[];
  private n2NetworkIndex: number;
  private n3Networks: RpcNetwork[];
  constructor(
    private chrome: ChromeService,
    private global: GlobalService,
    private http: HttpClient,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.currentWallet = state.currentWallet;
      this.currentChainType = state.currentChainType;
      this.n2Networks = state.n2Networks;
      this.n3Networks = state.n3Networks;
      this.n2NetworkIndex = state.n2NetworkIndex;
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.neo2WIFArr = state.neo2WIFArr;
    });
  }

  //#region init
  public walletIsOpen(): Observable<boolean> {
    return this.chrome.getStorage(STORAGE_NAME.wallet).pipe(
      map((res) => {
        const w = this.parseWallet(res);
        return w ? true : false;
      })
    );
  }
  public initData() {
    const getWallet = this.chrome.getStorage(STORAGE_NAME.wallet);
    const getNeo2WIFArr = this.chrome.getStorage(STORAGE_NAME.WIFArr);
    const getNeo3WIFArr = this.chrome.getStorage(STORAGE_NAME['WIFArr-Neo3']);
    const getNeo2WalletArr = this.chrome.getStorage(STORAGE_NAME.walletArr);
    const getNeo3WalletArr = this.chrome.getStorage(
      STORAGE_NAME['walletArr-Neo3']
    );
    const Neo3AddressFlag = this.chrome.getStorage(
      STORAGE_NAME.neo3AddressFlag
    );
    const Neo3RemoveT4Flag = this.chrome.getStorage(
      STORAGE_NAME.neo3RemoveT4Flag
    );
    //#region networks
    const getN2Networks = this.chrome.getStorage(STORAGE_NAME.n2Networks);
    const getN3Networks = this.chrome.getStorage(STORAGE_NAME.n3Networks);
    const getN2SelectedNetworkIndex = this.chrome.getStorage(
      STORAGE_NAME.n2SelectedNetworkIndex
    );
    const getN3SelectedNetworkIndex = this.chrome.getStorage(
      STORAGE_NAME.n3SelectedNetworkIndex
    );
    //#endregion
    forkJoin([
      getWallet,
      getNeo2WIFArr,
      getNeo3WIFArr,
      getNeo2WalletArr,
      getNeo3WalletArr,
      Neo3AddressFlag,
      getN2Networks,
      getN2SelectedNetworkIndex,
      getN3Networks,
      getN3SelectedNetworkIndex,
      Neo3RemoveT4Flag,
    ]).subscribe(
      ([
        walletRes,
        neo2WIFArrRes,
        neo3WIFArrRes,
        neo2WalletArrRes,
        neo3WalletArrRes,
        Neo3AddressFlagRes,
        n2NetworksRes,
        n2NetworkIndexRes,
        n3NetworksRes,
        n3NetworkIndexRes,
        Neo3RemoveT4FlagRes,
      ]) => {
        // wallet
        walletRes = this.parseWallet(walletRes);
        if (!walletRes) {
          return;
        }
        // neo2 walletArr
        if (neo2WalletArrRes && neo2WalletArrRes.length > 0) {
          const tempArr = [];
          neo2WalletArrRes.forEach((item) => {
            tempArr.push(this.parseWallet(item));
          });
          neo2WalletArrRes = tempArr;
        }
        // neo3 walletArr
        if (neo3WalletArrRes && neo3WalletArrRes.length > 0) {
          const tempArr = [];
          neo3WalletArrRes.forEach((item) => {
            tempArr.push(this.parseWallet(item));
          });
          neo3WalletArrRes = tempArr;
        }
        const chainType: ChainType = wallet3.isAddress(
          walletRes.accounts[0].address,
          53
        )
          ? 'Neo3'
          : 'Neo2';
        this.store.dispatch({
          type: INIT_ACCOUNT,
          data: {
            currentWallet: walletRes,
            currentChainType: chainType,
            neo2WalletArr: neo2WalletArrRes || [],
            neo3WalletArr: neo3WalletArrRes || [],
            neo2WIFArr: neo2WIFArrRes || [],
            neo3WIFArr: neo3WIFArrRes || [],
            n2Networks: n2NetworksRes || [],
            n3Networks: n3NetworksRes || [],
            n2NetworkIndex: n2NetworkIndexRes,
            n3NetworkIndex: n3NetworkIndexRes,
          },
        });
        //#region networks
        if (!Neo3RemoveT4FlagRes) {
          if (n3NetworksRes[1].chainId === 4) {
            n3NetworksRes[2].name = 'N3 TESTNET';
            n3NetworksRes.splice(1, 1);
            n3NetworkIndexRes = 0;
            this.store.dispatch({ type: UPDATE_NEO3_NETWORK_INDEX, data: 0 });
            this.store.dispatch({
              type: UPDATE_NEO3_NETWORKS,
              data: n3NetworksRes,
            });
          }
          this.chrome.setStorage(STORAGE_NAME.neo3RemoveT4Flag, true);
          this.getFastRpcUrl(true);
        } else {
          this.getFastRpcUrl();
        }
        //#endregion
        if (
          !Neo3AddressFlagRes &&
          neo3WIFArrRes &&
          neo3WIFArrRes.length > 0 &&
          neo3WalletArrRes &&
          neo3WalletArrRes.length > 0
        ) {
          neo3WalletArrRes.forEach((item, index) => {
            if (
              item.accounts[0]?.extra?.ledgerSLIP44 ||
              !neo3WIFArrRes[index]
            ) {
              return;
            }
            const account = new wallet3.Account(
              wallet3.getPrivateKeyFromWIF(neo3WIFArrRes[index])
            );
            Object.defineProperties(item.accounts[0], {
              address: { writable: true, readonly: false },
            });
            item.accounts[0].address = account.address;
            item.accounts[0].label = account.label;
            if (
              item.accounts[0].contract.script ===
              walletRes.accounts[0].contract.script
            ) {
              Object.defineProperties(walletRes.accounts[0], {
                address: { writable: true, readonly: false },
              });
              walletRes.accounts[0].address = item.accounts[0].address;
              walletRes.accounts[0].label = item.accounts[0].label;
              this.store.dispatch({ type: UPDATE_WALLET, data: walletRes });
              this.chrome.accountChangeEvent(walletRes);
            }
          });
          this.store.dispatch({
            type: UPDATE_NEO3_WALLETS_ADDRESS,
            data: neo3WalletArrRes,
          });
          this.chrome.setStorage(STORAGE_NAME.neo3AddressFlag, true);
        }
      }
    );
  }
  private async getRpcUrls(force = false) {
    console.log('-----------getRpcUrls');
    if (this.hasGetFastRpc && !force) {
      return null;
    }
    const defaultRpcUrls = await this.chrome
      .getStorage(STORAGE_NAME.rpcUrls)
      .toPromise();
    const headers = {};
    if (defaultRpcUrls.lastModified) {
      headers['If-Modified-Since'] = defaultRpcUrls.lastModified;
    }
    try {
      const responseRpcUrl = await this.http
        .get('https://cdn.neoline.io/nodelist.json', {
          headers,
          observe: 'response',
        })
        .pipe(
          map((res) => {
            const lastModified = res.headers.get('Last-Modified');
            this.chrome.setStorage(STORAGE_NAME.rpcUrls, {
              nodes: res.body,
              lastModified,
            });
            return res.body;
          })
        )
        .toPromise();
      return responseRpcUrl;
    } catch (error) {
      const shouldFindNode = await this.chrome.getShouldFindNode().toPromise();
      if (shouldFindNode !== false || force) {
        return defaultRpcUrls.nodes;
      }
      return null;
    }
  }
  async getFastRpcUrl(force = false) {
    if (this.loadingGetFastRpc && !force) {
      return;
    }
    this.loadingGetFastRpc = true;
    const rpcUrls = await this.getRpcUrls(force);
    if (rpcUrls === null) {
      this.loadingGetFastRpc = false;
      return;
    }
    const data = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getversion',
      params: [],
    };
    const startTime = new Date().getTime();
    const netReqs = { 1: [], 2: [], 3: [], 4: [], 6: [] };
    const spendTiems = { 1: [], 2: [], 3: [], 4: [], 6: [] };
    const fastIndex = { 1: 0, 2: 0, 3: 0, 4: 0, 6: 0 };
    Object.keys(rpcUrls).forEach((key) => {
      netReqs[key] = [];
      spendTiems[key] = [];
      fastIndex[key] = 0;
      rpcUrls[key].forEach((item, index) => {
        const req = this.http.post(item, data).pipe(
          catchError(() => of(null)),
          timeout(5000),
          catchError(() => of(null)),
          map((res) => {
            spendTiems[key][index] = res
              ? new Date().getTime() - startTime
              : -1;
            return res;
          })
        );
        netReqs[key].push(req);
      });
    });
    forkJoin([
      ...netReqs[1],
      ...netReqs[2],
      ...netReqs[3],
      ...netReqs[6],
    ]).subscribe(() => {
      Object.keys(spendTiems).forEach((key) => {
        spendTiems[key].forEach((time, index) => {
          if (time !== -1 && time < spendTiems[key][fastIndex[key]]) {
            fastIndex[key] = index;
          }
        });
      });
      this.n2Networks[0].rpcUrl = rpcUrls[1][fastIndex[1]];
      this.n2Networks[1].rpcUrl = rpcUrls[2][fastIndex[2]];
      this.n3Networks[0].rpcUrl = rpcUrls[3][fastIndex[3]];
      this.n3Networks[1].rpcUrl = rpcUrls[6][fastIndex[6]];
      this.store.dispatch({
        type: UPDATE_NEO3_NETWORKS,
        data: this.n3Networks,
      });
      this.store.dispatch({
        type: UPDATE_NEO2_NETWORKS,
        data: this.n2Networks,
      });
      this.loadingGetFastRpc = false;
      this.hasGetFastRpc = true;
      this.chrome.setShouldFindNode(false);
    });
  }
  //#endregion

  //#region wallet
  /**
   * 判断钱包地址是否存在
   * @param w 钱包地址
   */
  public verifyWallet(w: Wallet2 | Wallet3): boolean {
    let walletArr: Array<Wallet2 | Wallet3> = this.neo2WalletArr;
    if (wallet3.isAddress(w.accounts[0].address, 53)) {
      walletArr = this.neo3WalletArr;
    }
    if (walletArr === []) {
      return true;
    } else {
      if (
        walletArr.findIndex(
          (item) => item.accounts[0].address === w.accounts[0].address
        ) >= 0
      ) {
        return false;
      } else {
        return true;
      }
    }
  }
  public parseWallet(src: any): Wallet2 | Wallet3 {
    try {
      let isNeo3 = false;
      if (!src.accounts[0].address) {
        return null;
      }
      if (wallet3.isAddress(src.accounts[0].address, 53)) {
        isNeo3 = true;
      }
      const w = isNeo3 ? new Wallet3(src) : new Wallet2(src);
      if (!w.accounts.length) {
        return null;
      }
      return w;
    } catch (e) {
      return null;
    }
  }
  //#endregion

  //#region claim gas
  public async claimNeo2GAS(
    claims: Array<ClaimItem>
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
            item.accounts[0].address === this.currentWallet.accounts[0].address
        )
      ];
    if (!wif && !this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      const pwd = await this.chrome
        .getStorage(STORAGE_NAME.password)
        .toPromise();
      wif = (await (this.currentWallet.accounts[0] as any).decrypt(pwd)).WIF;
    }
    const txArr = [];
    claimArr.forEach((item, index) => {
      const newTx = new tx2.ClaimTransaction({
        claims: item,
      });
      newTx.addIntent(
        'GAS',
        valueArr[index],
        this.currentWallet.accounts[0].address
      );
      wif && newTx.sign(wif);
      txArr.push(newTx);
    });
    return txArr;
  }
  //#endregion

  //#region create/delete wallet
  /**
   * Create a new wallet include one NEP6 account.
   * 创建包含单个NEP6的新钱包
   * @param key encrypt password for new address
   */
  public createWallet(key: string, name: string = null): Observable<any> {
    if (this.selectedChainType === 'Neo2') {
      const privateKey = wallet2.generatePrivateKey();
      const account = new wallet2.Account(privateKey);
      const w = Neon2.create.wallet({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      const wif = w.accounts[0].WIF;
      return from(w.accounts[0].encrypt(key)).pipe(
        map(() => {
          (w.accounts[0] as any).wif = wif;
          return w;
        })
      );
    } else if (this.selectedChainType === 'Neo3') {
      const account = new wallet3.Account();
      const wif = account.WIF;
      const w = new wallet3.Wallet({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      return from(w.accounts[0].encrypt(key)).pipe(
        map(() => {
          (w.accounts[0] as any).wif = wif;
          return w;
        })
      );
    }
  }
  public delCurrentWallet() {
    if (this.neo2WalletArr.length + this.neo3WalletArr.length <= 1) {
      this.chrome.removeStorage(STORAGE_NAME.wallet);
      this.chrome.windowCallback({
        data: {
          address: this.currentWallet.accounts[0].address || '',
          label: this.currentWallet.name || '',
        },
        return: EVENT.DISCONNECTED,
      });
    }
    let newWallet;
    if (this.currentChainType === 'Neo2') {
      const index = this.neo2WalletArr.findIndex(
        (item) =>
          item.accounts[0].address === this.currentWallet.accounts[0].address
      );
      if (this.neo2WalletArr.length > 1) {
        newWallet = index === 0 ? this.neo2WalletArr[1] : this.neo2WalletArr[0];
      } else {
        if (this.neo3WalletArr.length > 0) {
          newWallet = this.neo3WalletArr[0];
        }
      }
    } else {
      const index = this.neo3WalletArr.findIndex(
        (item) =>
          item.accounts[0].address === this.currentWallet.accounts[0].address
      );
      if (this.neo3WalletArr.length > 1) {
        newWallet = index === 0 ? this.neo3WalletArr[1] : this.neo3WalletArr[0];
      } else {
        if (this.neo2WalletArr.length > 0) {
          newWallet = this.neo2WalletArr[0];
        }
      }
    }
    this.store.dispatch({
      type:
        this.currentChainType === 'Neo2'
          ? REMOVE_NEO2_WALLET
          : REMOVE_NEO3_WALLET,
      data: this.currentWallet,
    });
    if (newWallet) {
      this.store.dispatch({ type: UPDATE_WALLET, data: newWallet });
      this.chrome.accountChangeEvent(newWallet);
    }
    return of(newWallet);
  }
  //#endregion

  //#region import wallet
  /**
   * Create a new wallet include given private key and encrypt by given password.
   * 创建包含指定私钥的新钱包，并进行加密
   * @param privKey private key to import
   * @param key encrypt password for new address
   */
  public importPrivateKey(
    privKey: string,
    key: string,
    name: string = null
  ): Observable<Wallet2 | Wallet3> {
    if (this.selectedChainType === 'Neo2') {
      const account = new wallet2.Account(privKey);
      const w = Neon2.create.wallet({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      const wif = w.accounts[0].WIF;
      w.encrypt(0, key);
      return from(w.accounts[0].encrypt(key)).pipe(
        map(() => {
          (w.accounts[0] as any).wif = wif;
          return w;
        })
      );
    } else if (this.selectedChainType === 'Neo3') {
      const account = new wallet3.Account(privKey);
      const w = new wallet3.Wallet({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      const wif = w.accounts[0].WIF;
      w.encrypt(0, key);
      return from(w.accounts[0].encrypt(key)).pipe(
        map(() => {
          (w.accounts[0] as any).wif = wif;
          return w;
        })
      );
    }
  }
  /**
   * Create a new wallet include given private key and encrypt by given password.
   * 创建包含指定私钥的新钱包，并进行加密
   * @param privKey private key to import
   * @param key encrypt password for new address
   */
  public importWIF(
    wif: string,
    key: string,
    name: string = null
  ): Observable<Wallet2 | Wallet3> {
    if (this.selectedChainType === 'Neo2') {
      const account = new wallet2.Account(wallet2.getPrivateKeyFromWIF(wif));
      const w = Neon2.create.wallet({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      w.encrypt(0, key);
      return from(w.accounts[0].encrypt(key)).pipe(
        map(() => {
          (w.accounts[0] as any).wif = wif;
          return w;
        })
      );
    } else if (this.selectedChainType === 'Neo3') {
      const account = new wallet3.Account(wallet3.getPrivateKeyFromWIF(wif));
      const w = new wallet3.Wallet({
        name: name || 'NeoLineUser',
      } as any);
      w.addAccount(account);
      w.encrypt(0, key);
      return from(w.accounts[0].encrypt(key)).pipe(
        map(() => {
          (w.accounts[0] as any).wif = wif;
          return w;
        })
      );
    }
  }

  public async importEncryptKey(
    encKey: string,
    oldPwd: string,
    name: string,
    newPwd: string
  ) {
    if (this.selectedChainType === 'Neo2') {
      try {
        const wif = await wallet2.decrypt(encKey, oldPwd);
        const account = new wallet2.Account(wallet2.getPrivateKeyFromWIF(wif));
        account.label = name;
        const newWallet = new wallet2.Wallet({
          name: name || 'NeoLineUser',
        } as any);
        newWallet.addAccount(account);
        await newWallet.accounts[0].encrypt(newPwd);
        return newWallet;
      } catch (error) {
        return 'Wrong password';
      }
    } else if (this.selectedChainType === 'Neo3') {
      try {
        const wif = await wallet3.decrypt(encKey, oldPwd);
        const account = new wallet3.Account(wallet3.getPrivateKeyFromWIF(wif));
        account.label = name;
        const newWallet = new wallet3.Wallet({
          name: name || 'NeoLineUser',
        } as any);
        newWallet.addAccount(account);
        await newWallet.accounts[0].encrypt(newPwd);
        return newWallet;
      } catch (error) {
        return 'Wrong password';
      }
    }
  }
  //#endregion
  //#region neo2 create tx
  public createNeo2Tx(
    fromAddress: string,
    to: string,
    balances: UTXO[],
    amount: string,
    fee: number = 0
  ): Transaction {
    const fromScript = wallet2.getScriptHashFromAddress(fromAddress);
    const toScript = wallet2.getScriptHashFromAddress(to);
    if (fromScript.length !== 40 || toScript.length !== 40) {
      throw new Error('target address error');
    }
    if (balances.length === 0) {
      throw new Error('no balance');
    }
    let assetId = balances[0].asset_id;
    if (assetId.startsWith('0x') && assetId.length === 66) {
      assetId = assetId.substring(2);
    }
    const newTx = new tx2.ContractTransaction();

    newTx.addOutput({
      assetId,
      value: new Fixed8(amount),
      scriptHash: toScript,
    });
    let curr = bignumber('0');
    for (const item of balances) {
      curr = curr.add(bignumber(item.value) || 0);
      newTx.inputs.push(
        new TransactionInput({
          prevIndex: item.n,
          prevHash:
            item.txid.startsWith('0x') && item.txid.length === 66
              ? item.txid.substring(2)
              : item.txid,
        })
      );
      if (curr.comparedTo(bignumber(amount).add(bignumber(fee))) === 1) {
        break;
      }
    }
    const payback =
      assetId === GAS || assetId === GAS.substring(2)
        ? curr.sub(amount).sub(fee)
        : curr.sub(amount);
    if (payback.comparedTo(bignumber(0)) < 0) {
      throw new Error('no enough balance to pay');
    }
    if (payback.comparedTo(bignumber(0)) > 0) {
      newTx.addOutput({
        assetId,
        value: payback.toFixed() as any,
        scriptHash: fromScript,
      });
    }
    const remark = 'From NeoLine';
    newTx.addAttribute(tx2.TxAttrUsage.Remark1, u.str2hexstring(remark));
    return newTx;
  }
  public createNeo2TxForNEP5(
    fraomAddress: string,
    to: string,
    scriptHash: string,
    amount: string,
    decimals: number,
    broadcastOverride: boolean = false
  ): Transaction {
    const fromScript = wallet2.getScriptHashFromAddress(fraomAddress);
    const toScript = wallet2.getScriptHashFromAddress(to);
    if (fromScript.length !== 40 || toScript.length !== 40) {
      throw new Error('target address error');
    }
    const newTx = new tx2.InvocationTransaction();
    const amountBigNumber = bignumber(amount).mul(bignumber(10).pow(decimals));
    newTx.script = sc.createScript({
      scriptHash:
        scriptHash.startsWith('0x') && scriptHash.length === 42
          ? scriptHash.substring(2)
          : scriptHash,
      operation: 'transfer',
      args: [
        u.reverseHex(fromScript),
        u.reverseHex(toScript),
        Neon2.create.contractParam('Integer', amountBigNumber.toFixed()),
      ],
    });
    newTx.addAttribute(tx2.TxAttrUsage.Script, u.reverseHex(fromScript));
    const remark = broadcastOverride
      ? 'From NeoLine'
      : `From NeoLine at ${new Date().getTime()}`;
    newTx.addAttribute(tx2.TxAttrUsage.Remark1, u.str2hexstring(remark));
    return newTx;
  }
  //#endregion

  //#region other method
  private zeroPad(
    input: string | any[] | sc.OpCode,
    length: number,
    padEnd?: boolean
  ) {
    const zero = '0';
    input = String(input);

    if (length - input.length <= 0) {
      return input;
    }

    if (padEnd) {
      return input + zero.repeat(length - input.length);
    }

    return zero.repeat(length - input.length) + input;
  }
  public parseNeo2TxHashAttr(
    { type, value, txAttrUsage }: TxHashAttribute,
    isAddressToHex = false
  ): TxHashAttribute {
    let parsedValue = this.zeroPad(value, 64, true);
    switch (type) {
      case 'Boolean':
        parsedValue = this.zeroPad(
          !!value ? sc.OpCode.PUSHT : sc.OpCode.PUSHF,
          64,
          true
        );
        break;
      case 'Address':
        parsedValue = this.zeroPad(
          u.reverseHex(wallet2.getScriptHashFromAddress(value)),
          64,
          true
        );
        break;
      case 'Integer':
        const h = Number(value).toString(16);
        parsedValue = this.zeroPad(
          u.reverseHex(h.length % 2 ? '0' + h : h),
          64,
          true
        );
        break;
      case 'String':
        parsedValue = this.zeroPad(u.ab2hexstring(u.str2ab(value)), 64, true);
        break;
    }

    if (isAddressToHex && (txAttrUsage as any) === 'Remark14') {
      parsedValue = str2hexstring(value);
    }

    return {
      type,
      value: parsedValue,
      txAttrUsage,
    };
  }
  public isAsset(assetId: string): boolean {
    return assetId.startsWith('0x')
      ? assetId.length === 66
      : assetId.length === 64;
  }
  public getNeo2VerificationSignatureForSmartContract(
    ScriptHash: string
  ): Promise<any> {
    return rpc2.Query.getContractState(ScriptHash)
      .execute(this.n2Networks[this.n2NetworkIndex].rpcUrl)
      .then(({ result }) => {
        const { parameters } = result;
        return new tx2.Witness({
          invocationScript: '00'.repeat(parameters.length),
          verificationScript: '',
        });
      });
  }
  //#endregion

  //#region chain type
  selectChainType(chain: ChainType) {
    this.selectedChainType = chain;
  }
  //#endregion
}
