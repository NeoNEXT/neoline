import {
  Component,
  ViewChild,
  ElementRef,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { NeonService, ChromeService } from '@/app/core';
import { Router } from '@angular/router';
import { PopupSelectDialogComponent } from '../select/select.dialog';
import {
  ChainTypeGroups,
  ChainType,
  RpcNetwork,
  STORAGE_NAME,
} from '@popup/_lib';
import { PopupPasswordDialogComponent } from '../password/password.dialog';
import Sortable from 'sortablejs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
declare var chrome: any;

@Component({
  templateUrl: 'home-menu.dialog.html',
  styleUrls: ['home-menu.dialog.scss'],
})
export class PopupHomeMenuDialogComponent implements OnInit, OnDestroy {
  @ViewChild('walletContainer') private walletContainer: ElementRef;
  isSearching = false;

  private accountSub: Unsubscribable;
  private n2Networks: RpcNetwork[];
  private n3Networks: RpcNetwork[];
  private walletArr: {
    Neo2: Array<Wallet2 | Wallet3>;
    Neo3: Array<Wallet2 | Wallet3>;
  } = {
    Neo2: [],
    Neo3: [],
  };
  public displayWalletArr: Array<Wallet2 | Wallet3> = [];
  public wallet: Wallet2 | Wallet3;
  public chainType: ChainType;
  public networks: RpcNetwork[];
  selectedNetwork: RpcNetwork;
  constructor(
    private router: Router,
    private chromeSrc: ChromeService,
    private dialogRef: MatDialogRef<PopupHomeMenuDialogComponent>,
    private neon: NeonService,
    private dialog: MatDialog,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.walletArr.Neo2 = state.neo2WalletArr;
      this.walletArr.Neo3 = state.neo3WalletArr;
      this.wallet = state.currentWallet;
      this.n2Networks = state.n2Networks;
      this.n3Networks = state.n3Networks;
      this.networks = state.n2Networks.concat(state.n3Networks);
      this.chainType = state.currentChainType;
      this.displayWalletArr = this.walletArr[this.chainType];
      this.selectedNetwork =
        this.chainType === 'Neo2'
          ? state.n2Networks[state.n2NetworkIndex]
          : state.n3Networks[state.n3NetworkIndex];
    });
  }
  ngOnInit(): void {
    this.dragSort();
  }
  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }
  dragSort() {
    // const el = document.getElementsByClassName('address-list')[0];
    // Sortable.create(el, {
    //   onEnd: (/**Event*/ evt) => {
    //     this.neon.sortWallet(this.chainType, evt.oldIndex, evt.newIndex);
    //   },
    // });
  }
  public isActivityWallet(w: Wallet2 | Wallet3) {
    if (w.accounts[0].address === this.wallet.accounts[0].address) {
      return true;
    } else {
      return false;
    }
  }

  public dismiss() {
    this.dialogRef.close();
  }

  public async selectAccount(w: Wallet2 | Wallet3) {
    const hasLoginAddress = await this.chromeSrc
      .getHasLoginAddress()
      .toPromise();
    if (
      w.accounts[0]?.extra?.ledgerSLIP44 ||
      hasLoginAddress[w.accounts[0].address]
    ) {
      this.changeAccount(w);
      return;
    }
    this.dialog
      .open(PopupPasswordDialogComponent, {
        data: { account: w, chainType: this.chainType },
        panelClass: 'custom-dialog-panel',
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          this.chromeSrc.setHasLoginAddress(w.accounts[0].address);
          this.changeAccount(w);
        }
      });
  }

  private changeAccount(w) {
    if (this.chainType === 'Neo2') {
      const networkIndex = this.n2Networks.findIndex(
        (m) => m.id === this.selectedNetwork.id
      );
      this.chromeSrc.setStorage(
        STORAGE_NAME.n2SelectedNetworkIndex,
        networkIndex
      );
      this.chromeSrc.networkChangeEvent(this.n2Networks[networkIndex]);
    } else {
      const networkIndex = this.n3Networks.findIndex(
        (m) => m.id === this.selectedNetwork.id
      );
      this.chromeSrc.setStorage(
        STORAGE_NAME.n3SelectedNetworkIndex,
        networkIndex
      );
      this.chromeSrc.networkChangeEvent(this.n3Networks[networkIndex]);
    }
    this.wallet = this.neon.parseWallet(w);
    this.chromeSrc.setWallet(this.wallet.export());
    location.href = `index.html`;
    this.chromeSrc.setHaveBackupTip(null);
  }

  public lock() {
    this.dialogRef.close('lock');
    this.chromeSrc.setLogin(true);
    this.router.navigateByUrl('/popup/login');
  }

  to(type: 'create' | 'import') {
    this.dialog
      .open(PopupSelectDialogComponent, {
        data: {
          optionGroup: ChainTypeGroups,
          type: 'chain',
        },
        panelClass: 'custom-dialog-panel',
      })
      .afterClosed()
      .subscribe((chain) => {
        if (!chain) {
          return;
        }
        this.dismiss();
        if (type === 'create') {
          this.router.navigateByUrl('/popup/wallet/create');
        } else {
          this.router.navigateByUrl('/popup/wallet/import');
        }
      });
  }

  public exportWallet() {
    const sJson = JSON.stringify(this.wallet.export());
    const element = document.createElement('a');
    element.setAttribute(
      'href',
      'data:text/json;charset=UTF-8,' + encodeURIComponent(sJson)
    );
    element.setAttribute('download', `${this.wallet.name}.json`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  changeTabType(network: RpcNetwork) {
    this.selectedNetwork = network;
    this.chainType = network.chainId <= 2 ? 'Neo2' : 'Neo3';
    this.displayWalletArr = this.walletArr[this.chainType];
  }

  searchWallet($event) {
    let value: string = $event.target.value;
    value = value.trim().toLowerCase();
    if (value === '') {
      this.isSearching = false;
      this.displayWalletArr = this.walletArr[this.chainType];
      return;
    }
    this.isSearching = true;
    this.displayWalletArr = this.walletArr[this.chainType].filter(
      (item) =>
        item.name.toLowerCase().includes(value) ||
        item.accounts[0].address.toLowerCase().includes(value)
    );
  }

  importLedger() {
    if (chrome.runtime) {
      const extensionUrl = chrome.runtime.getURL('/index.html');
      const ledgerUrl = extensionUrl + '#/ledger';
      chrome.tabs.create({ url: ledgerUrl });
    } else {
      this.router.navigateByUrl('/ledger');
      this.dismiss();
    }
  }
}
