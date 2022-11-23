import { Component, OnInit, AfterContentInit, OnDestroy } from '@angular/core';
import { WalletCreation } from '../_lib/models';
import { WalletInitConstant, STORAGE_NAME } from '../_lib/constant';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Router, ActivatedRoute } from '@angular/router';
import { NeonService } from '@/app/core/services/neon.service';
import { ChromeService, GlobalService, UtilServiceState } from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupConfirmDialogComponent } from '../_dialogs';
import { ERRORS, requestTarget } from '@/models/dapi';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType, RpcNetwork, RESET_ACCOUNT } from '../_lib';

@Component({
  templateUrl: 'login.component.html',
  styleUrls: ['login.component.scss'],
})
export class PopupLoginComponent
  implements OnInit, AfterContentInit, OnDestroy
{
  public wallet: WalletCreation = new WalletCreation();
  public limit: any = WalletInitConstant;
  public hidePwd: boolean = true;
  public loading = false;
  public isInit: boolean = true;
  public isLedger = false;

  private accountSub: Unsubscribable;
  public accountWallet: Wallet2 | Wallet3;
  public allWallet = [];
  public selectedWalletIndex;
  private chainType: ChainType;
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private neon: NeonService,
    private chrome: ChromeService,
    private global: GlobalService,
    private dialog: MatDialog,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.chainType = state.currentChainType;
      this.accountWallet = state.currentWallet;
      this.allWallet = (state.neo2WalletArr as any).concat(state.neo3WalletArr);
      this.selectedWalletIndex = this.allWallet.findIndex(
        (item) =>
          item.accounts[0].address === state.currentWallet.accounts[0].address
      );
      if (
        this.accountWallet?.accounts[0]?.extra &&
        this.accountWallet?.accounts[0]?.extra?.ledgerSLIP44
      ) {
        this.isLedger = true;
      }
    });
  }

  ngOnInit(): void {
    window.onbeforeunload = () => {
      this.chrome.windowCallback({
        data: ERRORS.CANCELLED,
        return: requestTarget.Login,
      });
    };
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
  }

  ngAfterContentInit(): void {
    setTimeout(() => {
      this.isInit = false;
    });
  }

  public async login() {
    const hasLoginAddress = await this.chrome.getHasLoginAddress().toPromise();
    if (
      this.accountWallet.accounts[0]?.extra?.ledgerSLIP44 ||
      hasLoginAddress[this.accountWallet.accounts[0].address]
    ) {
      this.chrome.setLogin(false);
      const returnUrl = this.route.snapshot.queryParams.returnUrl || '/popup';
      this.router.navigateByUrl(returnUrl);
      return;
    }
    this.loading = true;
    const account: any =
      this.chainType === 'Neo3'
        ? this.util.getNeo3Account()
        : this.accountWallet.accounts[0];
    account
      .decrypt(this.wallet.password)
      .then((res) => {
        if (this.route.snapshot.queryParams.notification !== undefined) {
          this.chrome.windowCallback(
            {
              data: true,
              return: requestTarget.Login,
            },
            true
          );
        }
        this.loading = false;
        this.chrome.setHasLoginAddress(this.accountWallet.accounts[0].address);
        this.chrome.setLogin(false);
        const returnUrl = this.route.snapshot.queryParams.returnUrl || '/popup';
        this.router.navigateByUrl(returnUrl);
      })
      .catch((err) => {
        this.loading = false;
        this.global.snackBarTip('loginFailed');
      });
  }

  public togglePwd() {
    this.hidePwd = !this.hidePwd;
  }

  public resetWallet() {
    this.dialog
      .open(PopupConfirmDialogComponent, {
        data: 'resetWalletConfirm',
        panelClass: 'custom-dialog-panel',
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          this.store.dispatch({ type: RESET_ACCOUNT });
          this.chrome.resetWallet();
          this.router.navigateByUrl('/popup/wallet/new-guide');
        }
      });
  }

  public selectAccount(w: Wallet2 | Wallet3) {
    if (w.accounts[0].address === this.accountWallet.accounts[0].address) {
      return;
    }
    const newChainType = wallet3.isAddress(w?.accounts[0]?.address || '', 53)
      ? 'Neo3'
      : 'Neo2';
    if (newChainType !== this.chainType) {
      this.chrome.networkChangeEvent(
        newChainType === 'Neo2' ? this.n2Network : this.n3Network
      );
    }
    const wallet = this.neon.parseWallet(w);
    this.chrome.setWallet(wallet.export());
    location.reload();
  }
}
