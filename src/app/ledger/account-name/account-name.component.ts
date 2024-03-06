import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import {
  SLIP44,
  ChainType,
  ADD_NEO2_WALLETS,
  UPDATE_WALLET,
  ADD_NEO3_WALLETS,
  ADD_NEOX_WALLET,
} from '@/app/popup/_lib';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { NeonService, GlobalService, ChromeService } from '@/app/core';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';

@Component({
  selector: 'app-account-name',
  templateUrl: 'account-name.component.html',
  styleUrls: ['account-name.component.scss'],
})
export class AccountNameComponent {
  @Input() accountData;
  @Input() chainType: ChainType;
  @Output() importSuccess = new EventEmitter();

  name = '';

  constructor(
    private neon: NeonService,
    private global: GlobalService,
    private chrome: ChromeService,
    private store: Store<AppState>
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
        this.importSuccess.emit();
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
        this.importSuccess.emit();
      } else {
        this.global.snackBarTip('existingWallet');
      }
    } else {
      const w = new wallet3.Wallet({ name: this.name });
      w.addAccount(accountLike);
      const isEfficient = this.neon.verifyWallet(w);
      if (isEfficient) {
        this.store.dispatch({
          type: ADD_NEO3_WALLETS,
          data: { wallet: [w], wif: [''] },
        });
        this.store.dispatch({ type: UPDATE_WALLET, data: w });
        this.chrome.accountChangeEvent(w);
        this.importSuccess.emit();
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
