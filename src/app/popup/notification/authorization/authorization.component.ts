import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChromeService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { ERRORS, EVENT, requestTarget, Account } from '@/models/dapi';
import { STORAGE_NAME } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  templateUrl: './authorization.component.html',
  styleUrls: ['./authorization.component.scss'],
})
export class PopupNoticeAuthComponent implements OnInit, OnDestroy {
  public iconSrc = '';
  public hostname = '';
  public title = '';
  public selectedWalletArr: { Neo2: Array<Account>; Neo3: Array<Account> } = {
    Neo2: [],
    Neo3: [],
  };
  public allAuthWalletArr = {};

  public ruleCheck = false;
  public ruleSelected = 'true';
  showRuleOptions = false;

  private accountSub: Unsubscribable;
  public address = '';
  public wallet: Wallet2 | Wallet3;
  constructor(
    private chrome: ChromeService,
    private aRouter: ActivatedRoute,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.wallet = state.currentWallet;
      this.address = state.currentWallet?.accounts[0]?.address;
    });
    this.aRouter.queryParams.subscribe((params: any) => {
      this.hostname = params.hostname;
      if (params === undefined || params.icon === undefined) {
        this.iconSrc = '/assets/images/default_asset_logo.png';
      } else {
        this.iconSrc =
          this.hostname.indexOf('flamingo') >= 0
            ? '/assets/images/flamingo.ico'
            : params.icon;
      }
      this.title = params.title;
    });
    this.chrome
      .getStorage(STORAGE_NAME.authAddress)
      .subscribe((selectedWalletArr) => {
        this.selectedWalletArr =
          selectedWalletArr[this.hostname] || this.selectedWalletArr;
        this.allAuthWalletArr = selectedWalletArr;
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

  changeRule() {
    this.showRuleOptions = false;
    this.ruleSelected = this.ruleSelected === 'true' ? 'false' : 'true';
  }

  public refuse() {
    this.chrome.getStorage(STORAGE_NAME.connectedWebsites).subscribe((res) => {
      if (this.ruleCheck) {
        if (res[this.address] === undefined) {
          res[this.address] = [];
        }
        res[this.address].push({
          hostname: this.hostname,
          icon: this.iconSrc,
          title: this.title,
          status: this.ruleSelected,
        });
        this.chrome.setStorage(STORAGE_NAME.connectedWebsites, res);
      }
      this.chrome.windowCallback(
        {
          data: false,
          return: requestTarget.Connect,
        },
        true
      );
    });
  }
  public connect() {
    // let authAddressFlag = true;
    // this.chrome.getWallet().subscribe(currWallet => {
    //     if (wallet3.isAddress(currWallet.accounts[0].address)) {
    //         this.selectedWalletArr.Neo3.map(item => {
    //             if (item.address === currWallet.accounts[0].address) {
    //                 authAddressFlag = false;
    //             }
    //         });
    //         if (authAddressFlag) {
    //             this.selectedWalletArr.Neo3.push({
    //                 label: currWallet.name,
    //                 address: currWallet.accounts[0].address
    //             });
    //         }
    //     } else {
    //         this.selectedWalletArr.Neo2.map(item => {
    //             if (item.address === currWallet.accounts[0].address) {
    //                 authAddressFlag = false;
    //             }
    //         });
    //         if (authAddressFlag) {
    //             this.selectedWalletArr.Neo2.push({
    //                 label: currWallet.name,
    //                 address: currWallet.accounts[0].address
    //             });
    //         }
    //     }
    //     this.allAuthWalletArr[this.hostname] = this.selectedWalletArr;
    //     this.chrome.setAuthorizedAddress(this.allAuthWalletArr);
    // });
    this.chrome.getStorage(STORAGE_NAME.connectedWebsites).subscribe((res) => {
      if (this.ruleCheck) {
        if (res[this.address] === undefined) {
          res[this.address] = [];
        }
        res[this.address].push({
          hostname: this.hostname,
          icon: this.iconSrc,
          title: this.title,
          status: this.ruleSelected,
        });
        this.chrome.setStorage(STORAGE_NAME.connectedWebsites, res);
      }
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
