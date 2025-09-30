import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChromeService, SelectChainState, NeoAssetService } from '@/app/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ERRORS, EVENT, requestTarget } from '@/models/dapi';
import {
  ChainType,
  ConnectedWebsitesType,
  NEO3_CONTRACT,
  RpcNetwork,
  STORAGE_NAME,
  WalletListItem,
} from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { ETH_SOURCE_ASSET_HASH, EvmWalletJSON } from '../../_lib/evm';
import { MatDialog } from '@angular/material/dialog';
import {
  PopupConfirmDialogComponent,
  PopupSelectAccountsDialogComponent,
} from '../../_dialogs';
import { NEO } from '@/models/models';
import BigNumber from 'bignumber.js';
import { handleWallet } from '@/app/core/utils/app';

@Component({
  templateUrl: './authorization.component.html',
  styleUrls: ['./authorization.component.scss'],
})
export class PopupNoticeAuthComponent implements OnInit, OnDestroy {
  public iconSrc = '';
  public hostname = '';
  public title = '';
  public ruleCheck = false;
  private messageID = '';
  selectAccounts: Array<Wallet2 | Wallet3 | EvmWalletJSON> = [];
  addressBalances = {};
  isSelectAll = false;

  private accountSub: Unsubscribable;
  private currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  currentChainType: ChainType;
  currentNetwork: RpcNetwork;
  allWallets: WalletListItem[] = [];
  constructor(
    private chrome: ChromeService,
    private aRouter: ActivatedRoute,
    private dialog: MatDialog,
    private router: Router,
    private neoAssetService: NeoAssetService,
    private store: Store<AppState>,
    private selectChainState: SelectChainState
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentWallet = state.currentWallet;
      this.selectAccounts = [this.currentWallet];
      this.currentChainType = state.currentChainType;
      switch (this.currentChainType) {
        case 'Neo2':
          this.currentNetwork = state.n2Networks[state.n2NetworkIndex];
          this.allWallets = handleWallet(state.neo2WalletArr, 'Neo2');
          break;
        case 'Neo3':
          this.currentNetwork = state.n3Networks[state.n3NetworkIndex];
          this.allWallets = handleWallet(state.neo3WalletArr, 'Neo3');
          break;
        case 'NeoX':
          this.currentNetwork = state.neoXNetworks[state.neoXNetworkIndex];
          this.allWallets = handleWallet(state.neoXWalletArr, 'NeoX');
          break;
      }
      this.getBalances();
    });
    this.aRouter.queryParams.subscribe((params: any) => {
      this.hostname = params.hostname;
      this.iconSrc =
        this.hostname.indexOf('flamingo') >= 0
          ? '/assets/images/flamingo.ico'
          : params.icon;
      this.title = params.title;
      this.messageID = params.messageID;
    });
  }

  ngOnInit() {
    window.onbeforeunload = () => {
      this.chrome.windowCallback({
        data: ERRORS.CANCELLED,
        return: requestTarget.Connect,
        ID: this.messageID,
      });
    };
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  showCreateNeoX() {
    this.dialog
      .open(PopupConfirmDialogComponent, {
        data: 'createOrImportNeoXFirst',
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          this.selectChainState.selectChainType('NeoX');
          this.router.navigateByUrl('/popup/wallet/create');
        } else {
          this.refuse();
        }
      });
  }

  edit() {
    this.dialog
      .open(PopupSelectAccountsDialogComponent, {
        data: {
          displayList: this.allWallets,
          selectAccounts: this.selectAccounts,
          selectChainType: this.currentChainType,
          currentNetwork: this.currentNetwork,
          addressBalances: this.addressBalances,
          isSelectAll: this.isSelectAll,
        },
        panelClass: 'custom-dialog-panel',
        backdropClass: 'custom-dialog-backdrop',
      })
      .afterClosed()
      .subscribe(
        (res: {
          isSelectAll: boolean;
          selectAccounts: Array<Wallet2 | Wallet3 | EvmWalletJSON>;
        }) => {
          if (res) {
            this.selectAccounts = res.selectAccounts;
            this.isSelectAll = res.isSelectAll;
          }
        }
      );
  }

  public refuse() {
    this.chrome.windowCallback(
      {
        data: false,
        return: requestTarget.Connect,
        ID: this.messageID,
      },
      true
    );
  }
  public connect() {
    this.chrome
      .getStorage(STORAGE_NAME.connectedWebsites)
      .subscribe((res: ConnectedWebsitesType) => {
        if (!res[this.hostname]) {
          res[this.hostname] = {
            icon: this.iconSrc,
            title: this.title,
            connectedAddress: {},
          };
        }
        this.selectAccounts.forEach((item) => {
          res[this.hostname].connectedAddress[item.accounts[0].address] = {
            keep: this.ruleCheck,
            chain: this.currentChainType,
          };
        });
        this.chrome.setStorage(STORAGE_NAME.connectedWebsites, res);
        this.chrome.windowCallback({
          data: true,
          return: requestTarget.Connect,
          ID: this.messageID,
        });
        this.chrome.windowCallback(
          {
            data: {
              address: this.selectAccounts[0].accounts[0].address || '',
              label: this.selectAccounts[0].name || '',
            },
            return: EVENT.CONNECTED,
          },
          true
        );
      });
  }

  private getBalances() {
    const reqs = [];
    const addresses = [];
    let assetId = '';
    switch (this.currentChainType) {
      case 'Neo2':
        assetId = NEO;
        break;
      case 'Neo3':
        assetId = NEO3_CONTRACT;
        break;
      case 'NeoX':
        assetId = ETH_SOURCE_ASSET_HASH;
        break;
    }
    this.allWallets.forEach((group) => {
      group.walletArr.forEach((item) => {
        const req = this.neoAssetService.getAddressAssetBalance(
          item.accounts[0].address,
          assetId,
          this.currentChainType
        );
        reqs.push(req);
        addresses.push(item.accounts[0].address);
      });
    });

    Promise.all(reqs).then((res) => {
      addresses.forEach((address, index) => {
        let balance = res[index];
        if (this.currentChainType === 'NeoX') {
          balance = new BigNumber(res[index]).shiftedBy(-18).toFixed();
        }
        this.addressBalances[address] = balance;
      });
    });
  }
}
