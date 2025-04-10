import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ChromeService, NeonService } from '@/app/core';
import {
  RpcNetwork,
  ChainType,
  ADD_NEO2_WALLETS,
  ADD_NEO3_WALLETS,
  UPDATE_WALLET,
  STORAGE_NAME,
  ADD_NEOX_WALLET,
} from '../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { EvmWalletJSON } from '../_lib/evm';

type TabType = 'create' | 'import';
@Component({
  templateUrl: 'wallet.component.html',
  styleUrls: ['wallet.component.scss'],
})
export class PopupWalletComponent implements OnInit {
  tabType: TabType = 'import';
  private dapiData = {
    type: null,
    hostname: '',
    messageID: '',
    chainType: '',
  };
  password: string;
  getPassword = false;
  isOnePassword = false;
  hasPwdWallet = false;
  chainName = '';

  private accountSub: Unsubscribable;
  private network: RpcNetwork;
  private chainType: ChainType;
  neoXWalletArr: EvmWalletJSON[];
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chrome: ChromeService,
    private neon: NeonService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      switch (this.neon.selectedChainType) {
        case 'Neo2':
          this.network = state.n2Networks[state.n2NetworkIndex];
          break;
        case 'Neo3':
          this.network = state.n3Networks[state.n3NetworkIndex];
          break;
        case 'NeoX':
          this.network = state.neoXNetworks[state.neoXNetworkIndex];
          break;
      }
      this.neoXWalletArr = state.neoXWalletArr;
      this.chainType = state.currentChainType;
      this.checkHasPwdWallet(
        (state.neo2WalletArr as any).concat(state.neo3WalletArr)
      );
    });
    this.route.queryParams.subscribe((params: any) => {
      this.dapiData = {
        type: params.type,
        hostname: params.hostname,
        chainType: params.chainType,
        messageID: params.messageID,
      };
    });
  }

  ngOnInit(): void {
    this.getChainName();
    this.chrome.getStorage(STORAGE_NAME.onePassword).subscribe((res) => {
      if (res === true) {
        this.isOnePassword = true;
      }
      this.chrome.getPassword().then((res) => {
        this.getPassword = true;
        this.password = res;
      });
    });
    if (this.router.url === '/popup/wallet/import') {
      this.tabType = 'import';
    } else {
      this.tabType = 'create';
    }
  }

  private getChainName() {
    switch (this.neon.selectedChainType) {
      case 'Neo2':
        this.chainName = 'Neo Legacy';
        break;
      case 'Neo3':
        this.chainName = 'Neo N3';
        break;
      case 'NeoX':
        this.chainName = 'Neo X (EVM Network)';
        break;
    }
  }

  private checkHasPwdWallet(walletArr: Array<Wallet2 | Wallet3>) {
    const index = walletArr.findIndex(
      (w) => !w.accounts[0]?.extra?.ledgerSLIP44
    );
    this.hasPwdWallet = index >= 0 ? true : false;
  }

  public updateLocalWallet(newWallet: any) {
    const newChainType = this.neon.selectedChainType;
    const wif =
      this.isOnePassword || !this.hasPwdWallet ? '' : newWallet.accounts[0].wif;
    delete newWallet.accounts[0].wif;
    switch (newChainType) {
      case 'Neo2':
        this.store.dispatch({
          type: ADD_NEO2_WALLETS,
          data: { wallet: [newWallet], wif: [wif] },
        });
        break;
      case 'Neo3':
        this.store.dispatch({
          type: ADD_NEO3_WALLETS,
          data: { wallet: [newWallet], wif: [wif] },
        });
        break;
      case 'NeoX':
        this.store.dispatch({
          type: ADD_NEOX_WALLET,
          data: { wallet: newWallet },
        });
        break;
    }
    if (newChainType !== this.chainType) {
      this.chrome.networkChangeEvent(this.network);
    }
    this.store.dispatch({ type: UPDATE_WALLET, data: newWallet });
    if (this.dapiData.type === 'dapi') {
      const params = `type=dapi&hostname=${this.dapiData.hostname}&chainType=${this.dapiData.chainType}&messageID=${this.dapiData.messageID}`;
      this.router.navigateByUrl(`/popup/notification/pick-address?${params}`);
      return;
    }
    this.chrome.setHasLoginAddress(newWallet.accounts[0].address);
    this.chrome.accountChangeEvent(
      newChainType === 'NeoX' ? newWallet : newWallet.export()
    );
    if (this.route.snapshot.queryParams.returnUrl) {
      this.router.navigateByUrl(this.route.snapshot.queryParams.returnUrl);
    } else {
      if (newWallet.accounts[0].extra?.hasBackup === false) {
        this.router.navigate(['/popup/backup']);
      } else {
        this.router.navigateByUrl('/popup');
      }
    }
  }

  public handleFileWallet({ walletArr, wifArr }) {
    if (this.neon.selectedChainType !== this.chainType) {
      this.chrome.networkChangeEvent(this.network);
    }
    const newCurrentWallet = walletArr[walletArr.length - 1];
    this.store.dispatch({
      type: UPDATE_WALLET,
      data: newCurrentWallet,
    });
    if (this.neon.selectedChainType === 'NeoX') {
      this.store.dispatch({
        type: ADD_NEOX_WALLET,
        data: { wallet: newCurrentWallet },
      });
    } else {
      this.store.dispatch({
        type:
          this.neon.selectedChainType === 'Neo2'
            ? ADD_NEO2_WALLETS
            : ADD_NEO3_WALLETS,
        data: { wallet: walletArr, wif: wifArr },
      });
    }
    if (this.dapiData.type === 'dapi') {
      const params = `type=dapi&hostname=${this.dapiData.hostname}&chainType=${this.dapiData.chainType}&messageID=${this.dapiData.messageID}`;
      this.router.navigateByUrl(`/popup/notification/pick-address?${params}`);
      return;
    }
    this.chrome.setHasLoginAddress(newCurrentWallet.accounts[0].address);
    this.chrome.accountChangeEvent(
      this.neon.selectedChainType === 'NeoX'
        ? newCurrentWallet
        : newCurrentWallet.export()
    );
    const returnUrl = this.route.snapshot.queryParams.returnUrl || '/popup';
    this.router.navigateByUrl(returnUrl);
  }
}
