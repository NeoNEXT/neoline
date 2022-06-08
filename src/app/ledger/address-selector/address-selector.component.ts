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
import { LedgerService, NeonService } from '@/app/core';
import { interval } from 'rxjs';

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

    constructor(private ledger: LedgerService, private neon: NeonService) {}

    ngOnInit(): void {
        this.getLedgerStatus();
        this.getStatusInterval = interval(5000).subscribe(() => {
            this.getLedgerStatus();
        });
        this.getSavedAddress();
    }

    ngOnDestroy(): void {
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
        if (this.accountPage <= 1) {
            return;
        }
        this.fetchAccounts(--this.accountPage);
    }

    nextPage() {
        this.fetchAccounts(++this.accountPage);
    }

    private getSavedAddress() {
        if (this.chainType === 'Neo2') {
            this.neon.neo2WalletArr.forEach((item) => {
                this.savedAddressesObj[item.accounts[0].address] = true;
            });
        } else {
            this.neon.neo3WalletArr.forEach((item) => {
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
}
