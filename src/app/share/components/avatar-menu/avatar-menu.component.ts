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
  STORAGE_NAME,
} from '@popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable, forkJoin, timer } from 'rxjs';
import {
  PopupPasswordDialogComponent,
  PopupSelectDialogComponent,
} from '../../../popup/_dialogs';
import { NEO } from '@/models/models';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
declare var chrome: any;

@Component({
  selector: 'avatar-menu',
  templateUrl: 'avatar-menu.component.html',
  styleUrls: ['avatar-menu.component.scss'],
})
export class PopupAvatarMenuComponent implements OnInit, OnDestroy {
  @Output() closeEvent = new EventEmitter();
  isSearching = false;
  displayWalletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON> = [];
  addressBalances = {};
  isOnePassword = false;
  private searchSub: Unsubscribable;

  private accountSub: Unsubscribable;
  private chainType: ChainType;
  wallet: Wallet2 | Wallet3 | EvmWalletJSON;
  walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
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
      switch (this.chainType) {
        case 'Neo2':
          this.walletArr = state.neo2WalletArr;
          break;
        case 'Neo3':
          this.walletArr = state.neo3WalletArr;
          break;
        case 'NeoX':
          this.walletArr = state.neoXWalletArr;
          break;
      }
      this.displayWalletArr = this.walletArr;
      this.getBalances();
    });
  }
  ngOnInit(): void {
    this.chromeSrc.getStorage(STORAGE_NAME.onePassword).subscribe((res) => {
      if (res === true) {
        this.isOnePassword = true;
      }
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  close() {
    this.closeEvent.emit();
  }

  lock() {
    this.chromeSrc.setPassword('');
    this.navigate('/popup/login');
  }

  navigate(url: string) {
    this.close();
    this.router.navigateByUrl(url);
  }

  searchWallet($event) {
    this.searchSub?.unsubscribe();
    this.searchSub = timer(500).subscribe(() => {
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
    });
  }

  async selectAccount(w: Wallet2 | Wallet3) {
    const hasLoginAddress = await this.chromeSrc.getHasLoginAddress();
    this.close();
    if (
      w.accounts[0]?.extra?.ledgerSLIP44 ||
      hasLoginAddress[w.accounts[0].address]
    ) {
      this.changeAccount(w);
      return;
    }
    const pwd = await this.chromeSrc.getPassword();
    if (this.isOnePassword && pwd) {
      this.chromeSrc.setHasLoginAddress(w.accounts[0].address);
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
    this.chromeSrc.accountChangeEvent(w);
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

  async exportWallet() {
    if (!this.isOnePassword) {
      if (this.wallet.accounts[0]?.extra?.ledgerSLIP44) return;
      const exportJson = JSON.stringify((this.wallet as Wallet2).export());
      this.exportWalletJson(exportJson, this.chainType, this.wallet.name);
      return;
    }
    if (this.chainType === 'Neo2') {
      const neo2ExportWallet = new wallet2.Wallet({ name: 'NeoLineUser' });
      for (const item of this.walletArr as Wallet2[]) {
        if (item.accounts[0]?.extra?.ledgerSLIP44) {
          continue;
        }
        const account = item.accounts[0];
        account.label = item.name;
        neo2ExportWallet.addAccount(account.export());
      }
      const neo2ExportJson = JSON.stringify(neo2ExportWallet.export());
      this.exportWalletJson(neo2ExportJson, 'Neo2');
    } else if (this.chainType === 'Neo3') {
      const neo3ExportWallet = new wallet3.Wallet({ name: 'NeoLineUser' });
      for (const item of this.walletArr as Wallet3[]) {
        if (item.accounts[0]?.extra?.ledgerSLIP44) {
          continue;
        }
        const account = item.accounts[0];
        account.label = item.name;
        neo3ExportWallet.addAccount(account.export());
      }
      const neo3ExportJson = JSON.stringify(neo3ExportWallet.export());
      this.exportWalletJson(neo3ExportJson, 'Neo3');
    } else if (this.chainType === 'NeoX') {
      if (this.wallet.accounts[0]?.extra?.ledgerSLIP44) return;
      const target = JSON.parse(JSON.stringify(this.wallet));
      delete target.accounts;
      const exportJson = JSON.stringify(target);
      this.exportWalletJson(exportJson, this.chainType, this.wallet.name);
    }
  }
  private exportWalletJson(
    json: string,
    chainType: ChainType,
    exportFileName?: string
  ) {
    const element = document.createElement('a');
    element.setAttribute(
      'href',
      'data:text/json;charset=UTF-8,' + encodeURIComponent(json)
    );
    let name;
    switch (chainType) {
      case 'Neo2':
        name = 'neoline_neo_legacy';
        break;
      case 'Neo3':
        name = 'neoline_neo_n3';
        break;
      case 'NeoX':
        name = 'neoline_neox';
        break;
    }
    element.setAttribute('download', `${exportFileName || name}.json`);
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
