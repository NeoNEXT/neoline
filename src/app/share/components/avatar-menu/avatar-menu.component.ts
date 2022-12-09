import {
  Component,
  OnInit,
  OnDestroy,
  Output,
  EventEmitter,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { ChromeService, AssetState } from '@/app/core';
import { Router } from '@angular/router';
import {
  ChainTypeGroups,
  ChainType,
  UPDATE_WALLET,
  NEO3_CONTRACT,
} from '@popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable, forkJoin } from 'rxjs';
import {
  PopupPasswordDialogComponent,
  PopupSelectDialogComponent,
} from '../../../popup/_dialogs';
import { NEO } from '@/models/models';
declare var chrome: any;

@Component({
  selector: 'avatar-menu',
  templateUrl: 'avatar-menu.component.html',
  styleUrls: ['avatar-menu.component.scss'],
})
export class PopupAvatarMenuComponent implements OnInit, OnDestroy {
  @Output() closeEvent = new EventEmitter();
  isSearching = false;
  displayWalletArr: Array<Wallet2 | Wallet3> = [];
  addressBalances = {};

  private accountSub: Unsubscribable;
  private chainType: ChainType;
  wallet: Wallet2 | Wallet3;
  walletArr: Array<Wallet2 | Wallet3>;
  constructor(
    private router: Router,
    private chromeSrc: ChromeService,
    private dialog: MatDialog,
    private assetState: AssetState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.wallet = state.currentWallet;
      this.chainType = state.currentChainType;
      this.walletArr =
        this.chainType === 'Neo2' ? state.neo2WalletArr : state.neo3WalletArr;
      this.displayWalletArr = this.walletArr;
      this.getBalances();
    });
  }
  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  close() {
    this.closeEvent.emit();
  }

  lock() {
    this.chromeSrc.setLogin(true);
    this.navigate('/popup/login');
  }

  navigate(url: string) {
    this.close();
    this.router.navigateByUrl(url);
  }

  searchWallet($event) {
    let value = $event.target.value;
    value = value.trim().toLowerCase();
    if (value === '') {
      this.isSearching = false;
      this.displayWalletArr = this.walletArr;
      return;
    }
    this.isSearching = true;
    this.displayWalletArr = this.walletArr.filter(
      (item) =>
        item.name.toLowerCase().includes(value) ||
        item.accounts[0].address.toLowerCase().includes(value)
    );
  }

  async selectAccount(w: Wallet2 | Wallet3) {
    const hasLoginAddress = await this.chromeSrc
      .getHasLoginAddress()
      .toPromise();
    this.close();
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

  private changeAccount(w: Wallet2 | Wallet3) {
    this.wallet = w;
    this.store.dispatch({ type: UPDATE_WALLET, data: w });
    this.chromeSrc.setHaveBackupTip(null);
  }

  //#region wallet
  importLedger() {
    this.close();
    if (chrome.runtime) {
      const extensionUrl = chrome.runtime.getURL('/index.html');
      const ledgerUrl = extensionUrl + '#/ledger';
      chrome.tabs.create({ url: ledgerUrl });
    } else {
      this.router.navigateByUrl('/ledger');
    }
  }
  to(type: 'create' | 'import') {
    this.close();
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
        if (type === 'create') {
          this.router.navigateByUrl('/popup/wallet/create');
        } else {
          this.router.navigateByUrl('/popup/wallet/import');
        }
      });
  }

  exportWallet() {
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
  //#endregion

  private getBalances() {
    const reqs = [];
    const assetId = this.chainType === 'Neo2' ? NEO : NEO3_CONTRACT;
    this.walletArr.forEach((item) => {
      const req = this.assetState.getAddressAssetBalance(
        item.accounts[0].address,
        assetId,
        this.chainType
      );
      reqs.push(req);
    });
    forkJoin(reqs).subscribe((res) => {
      this.walletArr.forEach((item, index) => {
        this.addressBalances[item.accounts[0].address] = res[index];
      });
    });
  }
}
