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
  RpcNetwork,
} from '@popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable, timer } from 'rxjs';
import {
  PopupPasswordDialogComponent,
  PopupSelectDialogComponent,
} from '../../../popup/_dialogs';
import { NEO } from '@/models/models';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '@/app/popup/_lib/evm';
declare var chrome: any;

interface WalletListItem {
  chain: ChainType;
  title: string;
  expand: boolean;
  walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
}

@Component({
  selector: 'avatar-menu',
  templateUrl: 'avatar-menu.component.html',
  styleUrls: ['avatar-menu.component.scss'],
})
export class PopupAvatarMenuComponent implements OnInit, OnDestroy {
  @Output() closeEvent = new EventEmitter();
  isSearching = false;
  searchWalletRes: WalletListItem[] = [];
  addressBalances = {};
  isOnePassword = false;
  private searchSub: Unsubscribable;

  private accountSub: Unsubscribable;
  chainType: ChainType;
  wallet: Wallet2 | Wallet3 | EvmWalletJSON;
  neo2WalletArr: Array<Wallet2>;
  neo3WalletArr: Array<Wallet3>;
  neoXWalletArr: Array<EvmWalletJSON>;
  neoXNetwork: RpcNetwork;

  private displayList: WalletListItem[];
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
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.neoXWalletArr = state.neoXWalletArr;
      this.neoXNetwork = state.neoXNetworks[state.neoXNetworkIndex];
      this.displayList = [
        {
          chain: 'NeoX',
          title: 'Neo x (EVM network)',
          walletArr: this.neoXWalletArr,
          expand: this.chainType === 'NeoX',
        },
        {
          chain: 'Neo3',
          title: 'Neo N3',
          walletArr: this.neo3WalletArr,
          expand: this.chainType === 'Neo3',
        },
        {
          chain: 'Neo2',
          title: 'Neo Legacy',
          walletArr: this.neo2WalletArr,
          expand: this.chainType === 'Neo2',
        },
      ];
      this.searchWalletRes = this.displayList;
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
        this.searchWalletRes = this.displayList;
        return;
      }
      this.isSearching = true;
      const searchNeoX = this.filterWallet(value, this.neoXWalletArr);
      const searchNeo3 = this.filterWallet(value, this.neo3WalletArr);
      const searchNeo2 = this.filterWallet(value, this.neo2WalletArr);
      this.searchWalletRes = [
        {
          chain: 'NeoX',
          title: 'Neo x (EVM network)',
          walletArr: searchNeoX,
          expand: true,
        },
        {
          chain: 'Neo3',
          title: 'Neo N3',
          walletArr: searchNeo3,
          expand: true,
        },
        {
          chain: 'Neo2',
          title: 'Neo Legacy',
          walletArr: searchNeo2,
          expand: true,
        },
      ];
    });
  }

  filterWallet(
    value: string,
    walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>
  ) {
    return walletArr.filter(
      (item) =>
        item.name.toLowerCase().includes(value) ||
        item.accounts[0].address.toLowerCase().includes(value)
    );
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
      for (const item of this.neo2WalletArr as Wallet2[]) {
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
      for (const item of this.neo3WalletArr as Wallet3[]) {
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
    let assetId = '';
    let walletArr = [];
    switch (this.chainType) {
      case 'Neo2':
        assetId = NEO;
        walletArr = this.neo2WalletArr;
        break;
      case 'Neo3':
        assetId = NEO3_CONTRACT;
        walletArr = this.neo3WalletArr;
        break;
      case 'NeoX':
        assetId = ETH_SOURCE_ASSET_HASH;
        walletArr = this.neoXWalletArr;
        break;
    }
    walletArr.forEach((item) => {
      const req = this.assetState.getAddressAssetBalance(
        item.accounts[0].address,
        assetId,
        this.chainType
      );
      reqs.push(req);
    });

    Promise.all(reqs).then((res) => {
      walletArr.forEach((item, index) => {
        this.addressBalances[item.accounts[0].address] = res[index];
      });
    });
  }
}
