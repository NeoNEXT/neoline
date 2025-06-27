import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import {
  ChromeService,
  AssetState,
  NeonService,
  GlobalService,
} from '@/app/core';
import { Router } from '@angular/router';
import {
  ChainType,
  UPDATE_WALLET,
  NEO3_CONTRACT,
  STORAGE_NAME,
  RpcNetwork,
  ChainTypeGroups,
} from '@popup/_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable, timer } from 'rxjs';
import {
  PopupAddWalletDialogComponent,
  PopupConfirmDialogComponent,
  PopupExportWalletDialogComponent,
  PopupPasswordDialogComponent,
  PopupSelectDialogComponent,
} from '../_dialogs';
import { NEO } from '@/models/models';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '@/app/popup/_lib/evm';
import BigNumber from 'bignumber.js';

interface WalletListItem {
  chain: ChainType;
  title: string;
  expand: boolean;
  walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
}

@Component({
  templateUrl: 'account-list.component.html',
  styleUrls: ['account-list.component.scss'],
})
export class PopupAccountListComponent implements OnInit, OnDestroy {
  @ViewChild('moreModalDom') moreModalDom: ElementRef;
  @ViewChild('contentDom') contentDom: ElementRef;

  searchValue = '';
  isSearching = false;
  searchWalletRes: WalletListItem[] = [];
  addressBalances = {};
  isOnePassword = false;
  private searchSub: Unsubscribable;

  selectChainType: ChainType;
  displayList: WalletListItem[] = [];
  allWallet: { [chain: string]: WalletListItem[] } = {
    Neo2: [],
    Neo3: [],
    NeoX: [],
  };

  private accountSub: Unsubscribable;
  chainType: ChainType;
  wallet: Wallet2 | Wallet3 | EvmWalletJSON;
  neo2WalletArr: Array<Wallet2>;
  neo3WalletArr: Array<Wallet3>;
  neoXWalletArr: Array<EvmWalletJSON>;
  neoXNetwork: RpcNetwork;

  moreModalWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  moreModalChainType: ChainType;
  moreModalCanRemove = false;
  constructor(
    private router: Router,
    private chromeSrc: ChromeService,
    private dialog: MatDialog,
    private assetState: AssetState,
    private neon: NeonService,
    private global: GlobalService,
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
      this.initData();
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

  private initData() {
    if (!this.selectChainType) {
      this.selectChainType = this.chainType;
    }
    this.allWallet.Neo2 = this.handleWallet(this.neo2WalletArr, 'Neo2');
    this.allWallet.Neo3 = this.handleWallet(this.neo3WalletArr, 'Neo3');
    this.allWallet.NeoX = this.handleWallet(this.neoXWalletArr, 'NeoX');
    this.getDisplayList();
  }

  selectChain(chain: ChainType) {
    this.selectChainType = chain;
    this.getDisplayList();
  }

  navigate(url: string) {
    this.router.navigateByUrl(url);
  }

  clearSearch() {
    this.searchValue = '';
    this.isSearching = false;
    this.getDisplayList();
  }

  searchWallet($event) {
    this.searchSub?.unsubscribe();
    this.searchSub = timer(500).subscribe(() => {
      let value = $event.target.value;
      value = value.trim().toLowerCase();
      if (value === '') {
        this.isSearching = false;
        this.getDisplayList();
        return;
      }
      this.isSearching = true;
      this.searchWalletRes = [
        {
          title: 'Neo N3',
          walletArr: this.filterWallet(value, this.neo3WalletArr),
          expand: true,
          chain: 'Neo3',
        },
        {
          title: 'Neo X (EVM Network)',
          walletArr: this.filterWallet(value, this.neoXWalletArr),
          expand: true,
          chain: 'NeoX',
        },
        {
          title: 'Neo Legacy',
          walletArr: this.filterWallet(value, this.neo2WalletArr),
          expand: true,
          chain: 'Neo2',
        },
      ];
    });
  }

  private filterWallet(
    value: string,
    walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>
  ) {
    return walletArr.filter(
      (item) =>
        item.name.toLowerCase().includes(value) ||
        item.accounts[0].address.toLowerCase().includes(value)
    );
  }

  async selectAccount(w: Wallet2 | Wallet3, chain: ChainType) {
    const hasLoginAddress = await this.chromeSrc.getHasLoginAddress();
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
        data: { account: w, chainType: chain },
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
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
    this.router.navigateByUrl('/popup/home');
  }

  showAddWallet() {
    this.dialog
      .open(PopupAddWalletDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe((type) => {
        if (type) {
          this.dialog
            .open(PopupSelectDialogComponent, {
              data: {
                optionGroup: ChainTypeGroups,
                type: 'chain',
              },
              panelClass: 'custom-dialog-panel',
              backdropClass: 'custom-dialog-backdrop',
            })
            .afterClosed()
            .subscribe((chain) => {
              if (!chain) {
                return;
              }
              if (chain === 'NeoX') {
                this.chromeSrc
                  .getStorage(STORAGE_NAME.onePassword)
                  .subscribe((res) => {
                    if (res !== false) {
                      this.toCreate(type);
                    } else {
                      this.global.snackBarTip('switchOnePasswordFirst');
                      this.router.navigateByUrl('/popup/one-password');
                    }
                  });
              } else {
                this.toCreate(type);
              }
            });
        }
      });
  }

  toCreate(type) {
    if (type === 'create') {
      this.router.navigateByUrl('/popup/wallet/create');
    } else {
      this.router.navigateByUrl('/popup/wallet/import');
    }
  }

  openMoreModal(
    e: Event,
    item: Wallet2 | Wallet3 | EvmWalletJSON,
    chainType: ChainType
  ) {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const contentRect = this.contentDom.nativeElement.getBoundingClientRect();

    const top = rect.top - contentRect.top + 30;
    const bottom = contentRect.bottom - rect.bottom + 30;
    // 200: height of more modal + 30
    if (bottom < 200) {
      this.moreModalDom.nativeElement.style.bottom = bottom + 'px';
      this.moreModalDom.nativeElement.style.top = 'auto';
    } else {
      this.moreModalDom.nativeElement.style.top = top + 'px';
      this.moreModalDom.nativeElement.style.bottom = 'auto';
    }
    this.moreModalWallet = item;
    this.moreModalChainType = chainType;
    if (!item.accounts[0]?.extra?.ledgerSLIP44) {
      const neo2Accounts = this.neo2WalletArr.filter(
        (item) => !item.accounts[0]?.extra?.ledgerSLIP44
      );
      const neo3Accounts = this.neo3WalletArr.filter(
        (item) => !item.accounts[0]?.extra?.ledgerSLIP44
      );
      const neoXAccounts = this.neoXWalletArr.filter(
        (item) => !item.accounts[0]?.extra?.ledgerSLIP44
      );
      if (neo2Accounts.length + neo3Accounts.length + neoXAccounts.length > 1) {
        this.moreModalCanRemove = true;
      } else {
        this.moreModalCanRemove = false;
      }
    } else {
      this.moreModalCanRemove = true;
    }
  }

  removeAccount() {
    if (!this.moreModalWallet.accounts[0]?.extra?.ledgerSLIP44) {
      const neo2Accounts = this.neo2WalletArr.filter(
        (item) => !item.accounts[0]?.extra?.ledgerSLIP44
      );
      const neo3Accounts = this.neo3WalletArr.filter(
        (item) => !item.accounts[0]?.extra?.ledgerSLIP44
      );
      const neoXAccounts = this.neoXWalletArr.filter(
        (item) => !item.accounts[0]?.extra?.ledgerSLIP44
      );
      if (
        neo2Accounts.length + neo3Accounts.length + neoXAccounts.length <=
        1
      ) {
        return;
      }
    }
    this.dialog
      .open(PopupConfirmDialogComponent, {
        data: 'delWalletConfirm',
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          this.neon
            .delWallet(
              this.moreModalWallet,
              this.moreModalChainType,
              this.moreModalWallet.accounts[0].address ===
                this.wallet.accounts[0].address
            )
            .subscribe((w) => {
              this.closeMoreModal();
              if (!w) {
                this.router.navigateByUrl('/popup/wallet/new-guide');
              }
            });
        } else {
          this.closeMoreModal();
        }
      });
  }

  //#region wallet
  private exportThisWallet() {
    if (this.moreModalWallet.accounts[0]?.extra?.ledgerSLIP44) return;
    if (this.moreModalChainType !== 'NeoX') {
      const exportJson = JSON.stringify(
        (this.moreModalWallet as Wallet2).export()
      );
      this.exportWalletJson(
        exportJson,
        this.moreModalChainType,
        this.moreModalWallet.name
      );
    } else {
      const target = JSON.parse(JSON.stringify(this.moreModalWallet));
      delete target.accounts;
      const exportJson = JSON.stringify(target);
      this.exportWalletJson(
        exportJson,
        this.moreModalChainType,
        this.moreModalWallet.name
      );
    }
  }
  private exportAllWallet() {
    if (this.moreModalChainType === 'Neo2') {
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
    } else if (this.moreModalChainType === 'Neo3') {
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
    }
  }
  async exportWallet() {
    if (!this.isOnePassword || this.moreModalChainType === 'NeoX') {
      this.exportThisWallet();
      this.closeMoreModal();
      return;
    }
    this.dialog
      .open(PopupExportWalletDialogComponent, {
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe((res) => {
        if (res === 'current') {
          this.exportThisWallet();
        }
        if (res === 'all') {
          this.exportAllWallet();
        }
        this.closeMoreModal();
      });
  }

  private closeMoreModal() {
    this.moreModalWallet = undefined;
    this.moreModalChainType = undefined;
    this.moreModalCanRemove = false;
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
        let balance = res[index];
        if (this.chainType === 'NeoX') {
          balance = new BigNumber(res[index]).shiftedBy(-18).dp(8).toFixed();
        }
        this.addressBalances[item.accounts[0].address] = balance;
      });
    });
  }
  private getDisplayList() {
    switch (this.selectChainType) {
      case 'Neo2':
        this.displayList = this.allWallet.Neo2;
        break;
      case 'Neo3':
        this.displayList = this.allWallet.Neo3;
        break;
      case 'NeoX':
        this.displayList = this.allWallet.NeoX;
        break;
    }
  }

  private handleWallet(
    walletArr: Array<Wallet2 | Wallet3 | EvmWalletJSON>,
    chain: ChainType
  ): WalletListItem[] {
    const privateWalletArr = walletArr.filter(
      (item) => !item.accounts[0]?.extra?.ledgerSLIP44
    );
    const ledgerWalletArr = walletArr.filter(
      (item) =>
        item.accounts[0]?.extra?.ledgerSLIP44 &&
        item.accounts[0]?.extra?.device !== 'OneKey'
    );
    const oneKeyWalletArr = walletArr.filter(
      (item) => item.accounts[0]?.extra?.device === 'OneKey'
    );
    const res = [
      {
        title: 'Private key',
        walletArr: privateWalletArr,
        expand: true,
        chain,
      },
      { title: 'Ledger', walletArr: ledgerWalletArr, expand: true, chain },
    ];
    if (chain !== 'Neo2') {
      res.push({
        title: 'OneKey',
        walletArr: oneKeyWalletArr,
        expand: true,
        chain,
      });
    }
    return res;
  }
}
