import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChromeService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { ERRORS, EVENT, requestTarget, Account } from '@/models/dapi';
import { ChainType, ConnectedWebsitesType, STORAGE_NAME } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { EvmWalletJSON } from '../../_lib/evm';

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
  constructor(
    private chrome: ChromeService,
    private aRouter: ActivatedRoute,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.wallet = state.currentWallet;
      this.chainType = state.currentChainType;
      this.address = state.currentWallet?.accounts[0]?.address;
    });
    this.aRouter.queryParams.subscribe((params: any) => {
      this.hostname = params.hostname;
      this.iconSrc =
        this.hostname.indexOf('flamingo') >= 0
          ? '/assets/images/flamingo.ico'
          : params.icon;
      this.title = params.title;
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
