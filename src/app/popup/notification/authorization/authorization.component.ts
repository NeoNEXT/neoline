import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChromeService, NeonService } from '@/app/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ERRORS, EVENT, requestTarget, Account } from '@/models/dapi';
import { ChainType, ConnectedWebsitesType, STORAGE_NAME } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { EvmWalletJSON } from '../../_lib/evm';
import { MatDialog } from '@angular/material/dialog';
import { PopupConfirmDialogComponent } from '../../_dialogs';

@Component({
  templateUrl: './authorization.component.html',
  styleUrls: ['./authorization.component.scss'],
})
export class PopupNoticeAuthComponent implements OnInit, OnDestroy {
  public iconSrc = '';
  public hostname = '';
  public title = '';
  public ruleCheck = false;

  private accountSub: Unsubscribable;
  chainType: ChainType;
  public address = '';
  public wallet: Wallet2 | Wallet3 | EvmWalletJSON;
  private currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  private currentChainType: ChainType;
  private neoXWallet: EvmWalletJSON;
  constructor(
    private chrome: ChromeService,
    private aRouter: ActivatedRoute,
    private dialog: MatDialog,
    private neon: NeonService,
    private router: Router,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentWallet = state.currentWallet;
      this.currentChainType = state.currentChainType;
      this.neoXWallet = state.neoXWalletArr[0];
    });
    this.aRouter.queryParams.subscribe((params: any) => {
      this.hostname = params.hostname;
      this.iconSrc =
        this.hostname.indexOf('flamingo') >= 0
          ? '/assets/images/flamingo.ico'
          : params.icon;
      this.title = params.title;
      if (params.connectChainType === 'NeoX') {
        if (!this.neoXWallet) {
          this.showCreateNeoX()
          return;
        }
        this.chainType = 'NeoX';
        this.wallet = this.neoXWallet;
        this.address = this.neoXWallet.accounts[0].address;
      } else {
        this.chainType = this.currentChainType;
        this.wallet = this.currentWallet;
        this.address = this.wallet.accounts[0].address;
      }
    });
  }

  ngOnInit() {
    window.onbeforeunload = () => {
      this.chrome.windowCallback({
        data: ERRORS.CANCELLED,
        return: requestTarget.Connect,
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
          this.neon.selectChainType('NeoX');
          this.router.navigateByUrl('/popup/wallet/create');
        } else {
          this.refuse();
        }
      });
  }

  public refuse() {
    this.chrome.windowCallback(
      {
        data: false,
        return: requestTarget.Connect,
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
            connectedAddress: {
              [this.address]: {
                keep: this.ruleCheck,
                chain: this.chainType,
              },
            },
          };
        } else {
          res[this.hostname].connectedAddress[this.address] = {
            keep: this.ruleCheck,
            chain: this.chainType,
          };
        }
        this.chrome.setStorage(STORAGE_NAME.connectedWebsites, res);
        this.chrome.windowCallback({
          data: true,
          return: requestTarget.Connect,
        });
        this.chrome.windowCallback(
          {
            data: {
              address: this.address || '',
              label: this.wallet.name || '',
            },
            return: EVENT.CONNECTED,
          },
          true
        );
      });
  }
}
