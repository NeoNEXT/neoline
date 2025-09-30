import { ChromeService, GlobalService, Neo3Service } from '@/app/core';
import { Component, OnInit } from '@angular/core';
import {
  UntypedFormGroup,
  Validators,
  UntypedFormBuilder,
  UntypedFormControl,
} from '@angular/forms';
import {
  MyErrorStateMatcher,
  checkPasswords,
} from '../wallet/confirm-password';
import {
  WalletInitConstant,
  ChainType,
  STORAGE_NAME,
  UPDATE_ALL_WALLETS,
} from '../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { EvmWalletJSON } from '../_lib/evm';

@Component({
  templateUrl: 'one-password.component.html',
  styleUrls: ['./one-password.component.scss'],
})
export class PopupOnePasswordComponent implements OnInit {
  limit = WalletInitConstant;
  hideNewPwd = true;
  hideConfirmNewPwd = true;
  loading = false;

  pwdForm: UntypedFormGroup;
  matcher = new MyErrorStateMatcher();
  hideWalletsPwd = [];
  passCheckAddresses = {};

  accountSub: Unsubscribable;
  allWalletArr: Array<Wallet2 | Wallet3>;
  neo2WalletArr: Wallet2[];
  neo3WalletArr: Wallet3[];
  neo2WIFArr: string[];
  neo3WIFArr: string[];
  currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  currentChainType: ChainType;
  constructor(
    private fb: UntypedFormBuilder,
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>,
    private neo3Service: Neo3Service
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.currentWallet = state.currentWallet;
      this.currentChainType = state.currentChainType;
      this.neo2WIFArr = state.neo2WIFArr;
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo3WalletArr = state.neo3WalletArr;
      const walletsArr = (state.neo3WalletArr as any).concat(
        state.neo2WalletArr
      );
      this.handleWallets(walletsArr);
      this.initForm();
    });
  }

  ngOnInit() {
    this.chrome
      .getStorage(STORAGE_NAME.onePassCheckAddresses)
      .subscribe((res) => {
        this.passCheckAddresses = res || {};
      });
  }

  private handleWallets(list: Array<Wallet2 | Wallet3>) {
    this.allWalletArr = [];
    list.forEach((item) => {
      if (!item.accounts[0]?.extra?.ledgerSLIP44) {
        this.allWalletArr.push(item);
      }
    });
  }

  private initForm() {
    this.pwdForm = this.fb.group(
      {
        password: ['', [Validators.required, Validators.pattern(/^.{8,128}$/)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: checkPasswords }
    );
    const len = this.allWalletArr.length;
    this.hideWalletsPwd = new Array(len).fill(true);
    for (let i = 0; i < len; i++) {
      this.pwdForm.addControl(`password${i}`, new UntypedFormControl('', []));
    }
  }

  async checkItemPassword(index: number) {
    const item = this.allWalletArr[index];
    const chainType: ChainType = wallet3.isAddress(item.accounts[0].address, 53)
      ? 'Neo3'
      : 'Neo2';
    const account =
      chainType === 'Neo2'
        ? item.accounts[0]
        : this.neo3Service.getNeo3Account(item.accounts[0]);
    account
      .decrypt(this.pwdForm.value[`password${index}`])
      .then(() => {
        this.passCheckAddresses[account.address] = true;
        this.chrome.setStorage(
          STORAGE_NAME.onePassCheckAddresses,
          this.passCheckAddresses
        );
      })
      .catch(() => {
        this.pwdForm.controls[`password${index}`].setErrors({ wrong: true });
        this.pwdForm.markAsDirty();
      });
  }

  submit(): void {
    let flag = true;
    this.allWalletArr.forEach((item) => {
      if (!this.passCheckAddresses[item.accounts[0].address]) {
        flag = false;
      }
    });
    if (flag) {
      this.handleWalletArr();
    }
  }

  private async handleWalletArr() {
    this.loading = true;
    const newPwd = this.pwdForm.value.password;
    //#region neo3
    const neo3NewWalletArr = [];
    for (const [index, item] of this.neo3WIFArr.entries()) {
      if (item) {
        const account = new wallet3.Account(wallet3.getPrivateKeyFromWIF(item));
        account.label = this.neo3WalletArr[index].name;
        await account.encrypt(newPwd);
        let newWallet = new wallet3.Wallet({
          name: this.neo3WalletArr[index].name || 'NeoLineUser',
        });
        newWallet.addAccount(account);
        newWallet = new wallet3.Wallet(newWallet.export());
        neo3NewWalletArr.push(newWallet);
      } else {
        neo3NewWalletArr.push(this.neo3WalletArr[index]);
      }
    }
    //#endregion
    //#region neo2
    const neo2NewWalletArr = [];
    for (const [index, item] of this.neo2WIFArr.entries()) {
      if (item) {
        const account = new wallet2.Account(wallet2.getPrivateKeyFromWIF(item));
        account.label = this.neo2WalletArr[index].name;
        await account.encrypt(newPwd);
        let newWallet = new wallet2.Wallet({
          name: this.neo2WalletArr[index].name || 'NeoLineUser',
        });
        newWallet.addAccount(account);
        newWallet = new wallet2.Wallet(newWallet.export());
        neo2NewWalletArr.push(newWallet);
      } else {
        neo2NewWalletArr.push(this.neo2WalletArr[index]);
      }
    }
    //#endregion
    const newCurrentWallet = (
      this.currentChainType === 'Neo2' ? neo2NewWalletArr : neo3NewWalletArr
    ).find(
      (item) =>
        item.accounts[0].address === this.currentWallet.accounts[0].address
    );
    this.store.dispatch({
      type: UPDATE_ALL_WALLETS,
      data: {
        currentWallet: newCurrentWallet,
        neo2WalletArr: neo2NewWalletArr,
        neo3WalletArr: neo3NewWalletArr,
        neo2WIFArr: new Array(neo2NewWalletArr.length).fill(''),
        neo3WIFArr: new Array(neo3NewWalletArr.length).fill(''),
      },
    });
    this.chrome.setStorage(STORAGE_NAME.onePassword, true);
    this.chrome.setPassword(newPwd);
    this.global.snackBarTip('switchSucc');
    this.chrome.removeStorage(STORAGE_NAME.onePassCheckAddresses);
    this.loading = false;
    history.go(-1);
  }
}
