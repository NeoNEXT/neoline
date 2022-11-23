import {
  Component,
  OnInit,
  Input,
  OnDestroy,
  EventEmitter,
  Output,
} from '@angular/core';
import {
  ChainType,
  LedgerStatus,
  LedgerStatuses,
  LEDGER_PAGE_SIZE,
} from '@/app/popup/_lib';
import { LedgerService, SettingState } from '@/app/core';
import { interval } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

@Component({
  selector: 'app-address-selector',
  templateUrl: 'address-selector.component.html',
  styleUrls: ['address-selector.component.scss'],
})
export class AddressSelectorComponent implements OnInit, OnDestroy {
  @Input() chainType: ChainType;
  @Output() selectThisAccount = new EventEmitter();
  getStatusInterval;
  isReady = false;
  status: LedgerStatus = LedgerStatuses.DISCONNECTED;
  savedAddressesObj = {};

  selectedAccount;
  selectedIndex;

  accounts = [];
  accountPage = 1;
  isLoadingAccount = false;
  accountBalance = [];
  getBalanceReq;

  private accountSub: Unsubscribable;
  private neo2WalletArr: Wallet2[];
  private neo3WalletArr: Wallet3[];
  constructor(
    private ledger: LedgerService,
    private settingState: SettingState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo3WalletArr = state.neo3WalletArr;
    });
  }

  ngOnInit(): void {
    this.getLedgerStatus();
    this.getStatusInterval = interval(5000).subscribe(() => {
      this.getLedgerStatus();
    });
    this.getSavedAddress();
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
    this.getStatusInterval?.unsubscribe();
  }

  chooseAccount(index: number) {
    this.selectedAccount = this.accounts[index];
    this.selectedIndex = (this.accountPage - 1) * LEDGER_PAGE_SIZE + index;
    this.getBalanceReq?.unsubscribe();
    this.accountBalance = [];
    this.getBalanceReq = this.ledger
      .getLedgerBalance(this.selectedAccount.address, this.chainType)
      .subscribe((res) => {
        this.accountBalance = res;
      });
  }

  selectWallet() {
    if (this.selectedAccount) {
      this.selectThisAccount.emit({
        account: this.selectedAccount,
        index: this.selectedIndex,
      });
    }
  }

  prePage() {
    if (this.accountPage <= 1 || this.isLoadingAccount) {
      return;
    }
    this.fetchAccounts(--this.accountPage);
  }

  nextPage() {
    if (this.isLoadingAccount) {
      return;
    }
    this.fetchAccounts(++this.accountPage);
  }

  private getSavedAddress() {
    if (this.chainType === 'Neo2') {
      this.neo2WalletArr.forEach((item) => {
        this.savedAddressesObj[item.accounts[0].address] = true;
      });
    } else {
      this.neo3WalletArr.forEach((item) => {
        this.savedAddressesObj[item.accounts[0].address] = true;
      });
    }
  }

  private getLedgerStatus() {
    this.ledger.getDeviceStatus(this.chainType).then((res) => {
      if (LedgerStatuses[res]) {
        this.status = LedgerStatuses[res];
        this.isReady = this.status === LedgerStatuses.READY;
        if (this.isReady && this.accounts.length === 0) {
          this.fetchAccounts(1);
        }
        if (!this.isReady) {
          this.accounts = [];
        }
      }
    });
  }

  private fetchAccounts(index: number) {
    if (this.isLoadingAccount) {
      return;
    }
    this.isLoadingAccount = true;
    this.ledger
      .fetchAccounts(index, this.chainType)
      .then((accounts) => {
        this.accounts = accounts;
        this.isLoadingAccount = false;
      })
      .catch(() => {
        this.isLoadingAccount = false;
      });
  }

  public async jumbToWeb(type: 'privacy' | 'agreement') {
    this.settingState.langSub.subscribe((lang) => {
      if (lang !== 'en') {
        lang = '';
      } else {
        lang = '/en';
      }
      switch (type) {
        case 'privacy':
          window.open(`https://neoline.io${lang}/privacy`);
          break;
        case 'agreement':
          window.open(`https://neoline.io${lang}/agreement`);
          break;
      }
    });
  }
}
