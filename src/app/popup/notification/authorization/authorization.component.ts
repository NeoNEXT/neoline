import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  ChromeService,
  NeonService,
  NotificationService,
  GlobalService,
} from '@/app/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ERRORS, EVENT, requestTarget, Account } from '@/models/dapi';
import { STORAGE_NAME } from '../../_lib';

@Component({
  templateUrl: './authorization.component.html',
  styleUrls: ['./authorization.component.scss'],
})
export class PopupNoticeAuthComponent implements OnInit {
  public iconSrc = '';
  public hostname = '';
  public title = '';
  public wallet;
  public address = '';
  public accountName = '';
  public selectedWalletArr: { Neo2: Array<Account>; Neo3: Array<Account> } = {
    Neo2: [],
    Neo3: [],
  };
  public allAuthWalletArr = {};
  private paramsData: any;

  public ruleCheck = false;
  public ruleSelected = 'true';
  constructor(
    private chrome: ChromeService,
    private aRouter: ActivatedRoute,
    private neon: NeonService,
    private router: Router,
    private notificationI18n: NotificationService,
    private global: GlobalService
  ) {
    this.wallet = this.neon.wallet;
    this.address = this.wallet.accounts[0].address;
    this.accountName = this.wallet.name;
    this.aRouter.queryParams.subscribe((params: any) => {
      this.paramsData = params;
      this.hostname = params.hostname;
      if (params === undefined || params.icon === undefined) {
        this.iconSrc = '/assets/images/default_asset_logo.jpg';
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
  public refuse() {
    this.chrome.getStorage(STORAGE_NAME.connectedWebsites).subscribe((res) => {
      if (this.ruleCheck) {
        if (res[this.neon.wallet.accounts[0].address] === undefined) {
          res[this.neon.wallet.accounts[0].address] = [];
        }
        res[this.neon.wallet.accounts[0].address].push({
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
        if (res[this.neon.wallet.accounts[0].address] === undefined) {
          res[this.neon.wallet.accounts[0].address] = [];
        }
        res[this.neon.wallet.accounts[0].address].push({
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
            address: this.neon.address || '',
            label: this.neon.wallet.name || '',
          },
          return: EVENT.CONNECTED,
        },
        true
      );
    });
  }
}
