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
} from '../_lib';
import { wallet as wallet2 } from '@cityofzion/neon-core';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

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

  private accountSub: Unsubscribable;
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  private chainType: ChainType;
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chrome: ChromeService,
    private neon: NeonService,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
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
    this.chrome.getStorage(STORAGE_NAME.onePassword).subscribe((res) => {
      if (res === true) {
        this.isOnePassword = true;
      }
      this.chrome.getPassword().subscribe((res) => {
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

  private checkHasPwdWallet(walletArr: Array<Wallet2 | Wallet3>) {
    const index = walletArr.findIndex(
      (w) => !w.accounts[0]?.extra?.ledgerSLIP44
    );
    this.hasPwdWallet = index >= 0 ? true : false;
  }

  public updateLocalWallet(newWallet: any, isCreate: boolean) {
    const newChainType = wallet3.isAddress(newWallet.accounts[0].address, 53)
      ? 'Neo3'
      : 'Neo2';
    const wif =
      this.isOnePassword || !this.hasPwdWallet ? '' : newWallet.accounts[0].wif;
    newWallet =
      newChainType === 'Neo2'
        ? new wallet2.Wallet(newWallet.export())
        : new wallet3.Wallet(newWallet.export());
    if (newChainType !== this.chainType) {
      this.chrome.networkChangeEvent(
        newChainType === 'Neo2' ? this.n2Network : this.n3Network
      );
    }
    this.store.dispatch({ type: UPDATE_WALLET, data: newWallet });
    if (newChainType === 'Neo2') {
      this.store.dispatch({
        type: ADD_NEO2_WALLETS,
        data: { wallet: [newWallet], wif: [wif] },
      });
    } else {
      this.store.dispatch({
        type: ADD_NEO3_WALLETS,
        data: { wallet: [newWallet], wif: [wif] },
      });
    }
    if (this.dapiData.type === 'dapi') {
      const params = `type=dapi&hostname=${this.dapiData.hostname}&chainType=${this.dapiData.chainType}&messageID=${this.dapiData.messageID}`;
      this.router.navigateByUrl(`/popup/notification/pick-address?${params}`);
      return;
    }
    this.chrome.setHasLoginAddress(newWallet.accounts[0].address);
    this.chrome.accountChangeEvent(newWallet.export());
    if (isCreate) {
      this.chrome.setHaveBackupTip(true);
    } else {
      this.chrome.setWalletsStatus(newWallet.accounts[0].address);
      this.chrome.setHaveBackupTip(false);
    }
    const returnUrl =
      this.route.snapshot.queryParams.returnUrl ||
      (isCreate ? '/popup/backup' : '/popup');
    this.router.navigateByUrl(returnUrl);
  }

  public handleFileWallet({ walletArr, wifArr }) {
    if (this.neon.selectedChainType !== this.chainType) {
      this.chrome.networkChangeEvent(
        this.neon.selectedChainType === 'Neo2' ? this.n2Network : this.n3Network
      );
    }
    const newCurrentWallet = walletArr[walletArr.length - 1];
    this.store.dispatch({
      type: UPDATE_WALLET,
      data: newCurrentWallet,
    });
    this.store.dispatch({
      type:
        this.neon.selectedChainType === 'Neo2'
          ? ADD_NEO2_WALLETS
          : ADD_NEO3_WALLETS,
      data: { wallet: walletArr, wif: wifArr },
    });
    if (this.dapiData.type === 'dapi') {
      const params = `type=dapi&hostname=${this.dapiData.hostname}&chainType=${this.dapiData.chainType}&messageID=${this.dapiData.messageID}`;
      this.router.navigateByUrl(`/popup/notification/pick-address?${params}`);
      return;
    }
    this.chrome.setHasLoginAddress(newCurrentWallet.accounts[0].address);
    this.chrome.accountChangeEvent(newCurrentWallet.export());
    this.chrome.setWalletsStatus(newCurrentWallet.accounts[0].address);
    this.chrome.setHaveBackupTip(false);
    const returnUrl = this.route.snapshot.queryParams.returnUrl || '/popup';
    this.router.navigateByUrl(returnUrl);
  }
}
