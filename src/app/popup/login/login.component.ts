import { Component, OnInit, AfterContentInit, OnDestroy } from '@angular/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Router, ActivatedRoute } from '@angular/router';
import { ChromeService, GlobalService, UtilServiceState } from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import {
  PopupConfirmDialogComponent,
  PopupWalletListDialogComponent,
} from '../_dialogs';
import { ERRORS, requestTarget } from '@/models/dapi';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { ChainType, RpcNetwork, RESET_ACCOUNT, UPDATE_WALLET, STORAGE_NAME } from '../_lib';
import { FormGroup, Validators, FormBuilder } from '@angular/forms';

@Component({
  templateUrl: 'login.component.html',
  styleUrls: ['login.component.scss'],
})
export class PopupLoginComponent
  implements OnInit, AfterContentInit, OnDestroy
{
  loginForm: FormGroup;
  hidePwd: boolean = true;
  loading = false;
  isInit: boolean = true;
  selectWallet: Wallet2 | Wallet3;
  selectChainType: ChainType;
  isOnePassword = false;

  private accountSub: Unsubscribable;
  private currentWallet: Wallet2 | Wallet3;
  private allWallet = [];
  private currentChainType: ChainType;
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private chrome: ChromeService,
    private global: GlobalService,
    private dialog: MatDialog,
    private util: UtilServiceState,
    private fb: FormBuilder,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.currentChainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.selectWallet = state.currentWallet;
      this.allWallet = (state.neo3WalletArr as any).concat(state.neo2WalletArr);
    });
  }

  ngOnInit(): void {
    this.chrome.getStorage(STORAGE_NAME.onePassword).subscribe((res) => {
      if (res === true) {
        this.isOnePassword = true;
      }
    });
    this.loginForm = this.fb.group({
      password: ['', [Validators.required]],
    });
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

  async login() {
    if (this.loading || this.isInit) {
      return;
    }
    const hasLoginAddress = await this.chrome.getHasLoginAddress().toPromise();
    if (
      this.checkIsLedger(this.selectWallet) ||
      hasLoginAddress[this.selectWallet.accounts[0].address]
    ) {
      this.handleWallet();
      return;
    }
    if (this.loginForm.invalid) {
      return;
    }
    this.loading = true;
    const account: any =
      this.selectChainType === 'Neo3'
        ? this.util.getNeo3Account(this.selectWallet.accounts[0])
        : this.selectWallet.accounts[0];
    account
      .decrypt(this.loginForm.value.password)
      .then(() => {
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
        this.handleWallet();
      })
      .catch(() => {
        this.loading = false;
        this.loginForm.controls[`password`].setErrors({wrong: true});
        this.loginForm.markAsDirty();
      });
  }

  resetWallet() {
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

  showWalletList() {
    this.dialog
      .open(PopupWalletListDialogComponent, {
        data: {
          walletArr: this.allWallet,
          currentAddress: this.selectWallet.accounts[0].address,
        },
        panelClass: 'custom-dialog-panel',
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          this.selectWallet = res;
          this.selectChainType = wallet3.isAddress(
            this.selectWallet.accounts[0].address,
            53
          )
            ? 'Neo3'
            : 'Neo2';
        }
      });
  }

  checkIsLedger(w: Wallet2 | Wallet3): boolean {
    return w.accounts[0]?.extra?.ledgerSLIP44 ? true : false;
  }

  private handleWallet() {
    if (
      this.selectWallet.accounts[0].address !==
      this.currentWallet.accounts[0].address
    ) {
      this.store.dispatch({ type: UPDATE_WALLET, data: this.selectWallet });
      this.chrome.setWallet(this.selectWallet.export());
      this.chrome.setHasLoginAddress(this.selectWallet.accounts[0].address);
      if (this.selectChainType !== this.currentChainType) {
        this.chrome.networkChangeEvent(
          this.selectChainType === 'Neo2' ? this.n2Network : this.n3Network
        );
      }
    }
    this.chrome.setLogin(false);
    const returnUrl = this.route.snapshot.queryParams.returnUrl || '/popup';
    this.router.navigateByUrl(returnUrl);
  }
}
