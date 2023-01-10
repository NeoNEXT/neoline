import { UtilServiceState, ChromeService, GlobalService } from '@/app/core';
import { Component, OnInit } from '@angular/core';
import {
  FormGroup,
  Validators,
  FormBuilder,
  FormControl,
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
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { wallet as wallet2 } from '@cityofzion/neon-js';

@Component({
  templateUrl: 'one-password.component.html',
  styleUrls: ['./one-password.component.scss'],
})
export class PopupOnePasswordComponent implements OnInit {
  limit = WalletInitConstant;
  hideNewPwd = true;
  hideConfirmNewPwd = true;
  loading = false;

  pwdForm: FormGroup;
  matcher = new MyErrorStateMatcher();
  hideWalletsPwd = [];

  accountSub: Unsubscribable;
  allWalletArr: Array<Wallet2 | Wallet3>;
  neo2WalletArr: Wallet2[];
  neo3WalletArr: Wallet3[];
  neo2WIFArr: string[];
  neo3WIFArr: string[];
  currentWallet: Wallet2 | Wallet3;
  currentChainType: ChainType;
  constructor(
    private fb: FormBuilder,
    private util: UtilServiceState,
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>
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

  ngOnInit() {}

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
      this.pwdForm.addControl(
        `password${i}`,
        new FormControl('', [
          Validators.required,
          Validators.pattern(/^.{8,128}$/),
        ])
      );
    }
  }

  submit(): void {
    this.loading = true;
    const decryptReqs = [];
    this.allWalletArr.forEach((item, index) => {
      const chainType: ChainType = wallet3.isAddress(
        item.accounts[0].address,
        53
      )
        ? 'Neo3'
        : 'Neo2';
      const account =
        chainType === 'Neo2'
          ? item.accounts[0]
          : this.util.getNeo3Account(item.accounts[0]);
      const req = account
        .decrypt(this.pwdForm.value[`password${index}`])
        .catch(() => false);
      decryptReqs.push(req);
    });
    Promise.all(decryptReqs).then((resArr) => {
      resArr.forEach((res, index) => {
        if (res === false) {
          this.pwdForm.controls[`password${index}`].setErrors({ wrong: true });
          this.pwdForm.markAsDirty();
        }
      });
      if (this.pwdForm.valid) {
        this.handleWalletArr();
      } else {
        this.loading = false;
      }
    });
  }

  private async handleWalletArr() {
    const newPwd = this.pwdForm.value.password;
    //#region neo3
    const neo3ExportWallet = new wallet3.Wallet({ name: 'NeoLineUser' });
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
        neo3ExportWallet.addAccount(account);
      } else {
        neo3NewWalletArr.push(this.neo3WalletArr[index]);
      }
    }
    const neo3ExportJson = JSON.stringify(neo3ExportWallet.export());
    this.exportWalletJson(neo3ExportJson, 'Neo3');
    //#endregion
    //#region neo2
    const neo2ExportWallet = new wallet2.Wallet({ name: 'NeoLineUser' });
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
        neo2ExportWallet.addAccount(account);
      } else {
        neo2NewWalletArr.push(this.neo2WalletArr[index]);
      }
    }
    const neo2ExportJson = JSON.stringify(neo2ExportWallet.export());
    this.exportWalletJson(neo2ExportJson, 'Neo2');
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
      },
    });
    this.chrome.setStorage(STORAGE_NAME.onePassword, true);
    this.global.snackBarTip('switchSucc');
    this.loading = false;
    history.go(-1);
  }
  private exportWalletJson(json: string, chainType: ChainType) {
    const element = document.createElement('a');
    element.setAttribute(
      'href',
      'data:text/json;charset=UTF-8,' + encodeURIComponent(json)
    );
    const name = chainType === 'Neo2' ? 'neoline_neo_legacy' : 'neoline_neo_n3';
    element.setAttribute('download', `${name}.json`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
}
