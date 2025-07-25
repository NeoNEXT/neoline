import { Component, Input } from '@angular/core';
import {
  SLIP44,
  ChainType,
  ADD_NEO2_WALLETS,
  UPDATE_WALLET,
  ADD_NEO3_WALLETS,
  ADD_NEOX_WALLET,
  HardwareDevice,
} from '@/app/popup/_lib';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { Wallet3 } from '@popup/_lib';
import { NeonService, GlobalService, ChromeService } from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { Router } from '@angular/router';

@Component({
  selector: 'app-account-name',
  templateUrl: 'account-name.component.html',
  styleUrls: ['account-name.component.scss'],
})
export class AccountNameComponent {
  @Input() accountData;
  @Input() device: HardwareDevice;
  @Input() chainType: ChainType;

  name = '';

  constructor(
    private neon: NeonService,
    private global: GlobalService,
    private chrome: ChromeService,
    private store: Store<AppState>,
    private router: Router
  ) {}

  importLedgerWallet() {
    if (this.checkName() === false) {
      return;
    }
    const { account, index } = this.accountData;
    if (this.chainType === 'NeoX') {
      const tempWallet: EvmWalletJSON = {
        name: this.name,
        accounts: [
          {
            address: account.address,
            extra: {
              publicKey: account.publicKey,
              ledgerAddressIndex: index,
              ledgerSLIP44: SLIP44[this.chainType],
              device: this.device,
            },
          },
        ],
      };
      const isEfficient = this.neon.verifyWallet(tempWallet);
      if (isEfficient) {
        this.store.dispatch({
          type: ADD_NEOX_WALLET,
          data: { wallet: tempWallet },
        });
        this.store.dispatch({ type: UPDATE_WALLET, data: tempWallet });
        this.chrome.accountChangeEvent(tempWallet);
        this.router.navigateByUrl('/popup/home');
      } else {
        this.global.snackBarTip('existingWallet');
      }
      return;
    }
    const accountLike = account.export();
    accountLike.extra = {
      publicKey: account.publicKey,
      ledgerAddressIndex: index,
      ledgerSLIP44: SLIP44[this.chainType],
      device: this.device,
    };
    if (this.chainType === 'Neo2') {
      const w = new wallet2.Wallet({ name: this.name });
      w.addAccount(accountLike);
      const isEfficient = this.neon.verifyWallet(w);
      if (isEfficient) {
        this.store.dispatch({
          type: ADD_NEO2_WALLETS,
          data: { wallet: [w], wif: [''] },
        });
        this.store.dispatch({ type: UPDATE_WALLET, data: w });
        this.chrome.accountChangeEvent(w);
        this.router.navigateByUrl('/popup/home');
      } else {
        this.global.snackBarTip('existingWallet');
      }
    } else {
      const w = new Wallet3({ name: this.name });
      w.addAccount(accountLike);
      const isEfficient = this.neon.verifyWallet(w);
      if (isEfficient) {
        this.store.dispatch({
          type: ADD_NEO3_WALLETS,
          data: { wallet: [w], wif: [''] },
        });
        this.store.dispatch({ type: UPDATE_WALLET, data: w });
        this.chrome.accountChangeEvent(w);
        this.router.navigateByUrl('/popup/home');
      } else {
        this.global.snackBarTip('existingWallet');
      }
    }
  }

  private checkName() {
    const name = this.name.trim();
    if (name === '') {
      this.global.snackBarTip('PleaseEnterWalletName');
      return false;
    }
    return true;
  }
}
