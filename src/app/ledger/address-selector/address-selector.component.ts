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
  HardwareDevice,
} from '@/app/popup/_lib';
import {
  LedgerService,
  SettingState,
  AssetEVMState,
  OneKeyService,
} from '@/app/core';
import { interval } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';

@Component({
  selector: 'app-address-selector',
  templateUrl: 'address-selector.component.html',
  styleUrls: ['address-selector.component.scss'],
})
export class AddressSelectorComponent implements OnInit, OnDestroy {
  @Input() chainType: ChainType;
  @Input() device: HardwareDevice;
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
  settingStateSub: Unsubscribable;

  private accountSub: Unsubscribable;
  private neo2WalletArr: Wallet2[];
  private neo3WalletArr: Wallet3[];
  private neoXWalletArr: EvmWalletJSON[];
  neoXChainId: number;
  constructor(
    private ledger: LedgerService,
    private oneKeyService: OneKeyService,
    private settingState: SettingState,
    private assetEVMState: AssetEVMState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.neo2WalletArr = state.neo2WalletArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.neoXWalletArr = state.neoXWalletArr;
      this.neoXChainId = state.neoXNetworks[state.neoXNetworkIndex].chainId;
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
    this.settingStateSub?.unsubscribe();
  }

  chooseAccount(index: number) {
    this.selectedAccount = this.accounts[index];
    this.selectedIndex = (this.accountPage - 1) * LEDGER_PAGE_SIZE + index;
    if (this.chainType === 'NeoX') {
      this.assetEVMState
        .getNeoXAddressBalances(this.selectedAccount.address)
        .then((res) => {
          this.accountBalance = res;
        });
      return;
    }
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
    switch (this.chainType) {
      case 'Neo2':
        this.neo2WalletArr.forEach((item) => {
          this.savedAddressesObj[item.accounts[0].address] = true;
        });
        break;
      case 'Neo3':
        this.neo3WalletArr.forEach((item) => {
          this.savedAddressesObj[item.accounts[0].address] = true;
        });
        break;
      case 'NeoX':
        this.neoXWalletArr.forEach((item) => {
          this.savedAddressesObj[item.accounts[0].address] = true;
        });
        break;
    }
  }

  private getLedgerStatus() {
    if (this.device === 'Ledger') {
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
    if (this.device === 'OneKey') {
      this.oneKeyService.getDeviceStatus().then((res) => {
        if (res.success && res.payload.length > 0) {
          this.getStatusInterval?.unsubscribe();
          this.oneKeyService.getPassphraseState().then((state) => {
            if (state.success && this.accounts.length === 0) {
              this.isReady = true;
              this.fetchAccounts(1);
            }
          });
        }
      });
    }
  }

  private fetchAccounts(index: number) {
    if (this.isLoadingAccount) {
      return;
    }
    this.isLoadingAccount = true;
    if (this.device === 'Ledger') {
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
    if (this.device === 'OneKey') {
      this.oneKeyService
        .fetchAccounts(index, this.chainType)
        .then((accounts) => {
          this.accounts = accounts;
          this.isLoadingAccount = false;
        })
        .catch(() => {
          this.isLoadingAccount = false;
        });
    }
  }

  public async jumbToWeb(type: 'privacy' | 'agreement') {
    this.settingStateSub = this.settingState.langSub.subscribe((lang) => {
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
