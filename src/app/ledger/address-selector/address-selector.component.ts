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
  QRCodeWallet,
} from '@/app/popup/_lib';
import {
  LedgerService,
  SettingState,
  OneKeyService,
  EvmAssetService,
} from '@/app/core';
import { interval } from 'rxjs';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { EvmWalletJSON } from '@/app/popup/_lib/evm';
import { LinkType } from '@/app/popup/_lib/setting';
import { generateAddressFromXpub } from '@keystonehq/bc-ur-registry-eth';

@Component({
  selector: 'app-address-selector',
  templateUrl: 'address-selector.component.html',
  styleUrls: ['address-selector.component.scss'],
})
export class AddressSelectorComponent implements OnInit, OnDestroy {
  @Input() chainType: ChainType;
  @Input() device: HardwareDevice;
  @Input() qrCodeData: QRCodeWallet;
  @Output() selectThisAccount = new EventEmitter();
  getStatusInterval;
  isReady = false;
  status: LedgerStatus = LedgerStatuses.DISCONNECTED;
  savedAddressesObj = {};
  hasInstallOneKeyBridge = true;

  selectedAccount;
  selectedIndex;

  accounts = [];
  qrCodeAccounts = [];
  accountPage = 1;
  isLoadingAccount = false;
  accountBalance = [];
  getBalanceReq;

  private accountSub: Unsubscribable;
  private neo2WalletArr: Wallet2[];
  private neo3WalletArr: Wallet3[];
  private neoXWalletArr: EvmWalletJSON[];
  neoXChainId: number;
  constructor(
    private ledger: LedgerService,
    private oneKeyService: OneKeyService,
    private settingState: SettingState,
    private store: Store<AppState>,
    private evmAssetService: EvmAssetService
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
    if (this.device === 'QRCode') {
      this.isReady = true;
      this.accounts = this.getQrCodeAccounts(1);
    } else {
      this.getLedgerStatus();
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus();
      });
    }
    this.getSavedAddress();
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
    this.getStatusInterval?.unsubscribe();
  }

  chooseAccount(index: number) {
    this.selectedAccount = this.accounts[index];
    this.selectedIndex = (this.accountPage - 1) * LEDGER_PAGE_SIZE + index;
    if (this.chainType === 'NeoX') {
      this.evmAssetService
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
        if (!res.success && 'code' in res.payload && res.payload.code === 808) {
          this.hasInstallOneKeyBridge = false;
        }
        if (res.success && res.payload.length > 0) {
          this.hasInstallOneKeyBridge = true;
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
    if (this.device === 'QRCode') {
      this.accounts = this.getQrCodeAccounts(index);
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

  private getQrCodeAccounts(page: number) {
    if (this.qrCodeAccounts[page]) {
      return this.qrCodeAccounts[page];
    }
    const startingIndex = (page - 1) * LEDGER_PAGE_SIZE;
    const maxIndex = page * LEDGER_PAGE_SIZE;
    let newAccounts = [];
    for (let index = startingIndex; index < maxIndex; index++) {
      const address = generateAddressFromXpub(
        this.qrCodeData.pubKey,
        `M/0/${index}`
      );
      newAccounts.push({
        address,
        xfp: this.qrCodeData.xfp,
        publicKey: this.qrCodeData.pubKey,
      });
    }
    this.qrCodeAccounts[page] = newAccounts;
    return newAccounts;
  }

  jumbToWeb(type: LinkType) {
    this.settingState.toWeb(type);
  }
}
