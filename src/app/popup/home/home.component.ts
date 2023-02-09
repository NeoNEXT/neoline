import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  AssetState,
  NeonService,
  GlobalService,
  HomeService,
  LedgerService,
  ChromeService,
  UtilServiceState,
} from '@/app/core';
import { NEO, GAS, Asset } from '@/models/models';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { MatDialog } from '@angular/material/dialog';
import { PopupConfirmDialogComponent } from '../_dialogs';
import { Router } from '@angular/router';
import { rpc } from '@cityofzion/neon-core';
import {
  NEO3_CONTRACT,
  LedgerStatuses,
  GAS3_CONTRACT,
  ChainType,
  RpcNetwork,
  STORAGE_NAME,
} from '../_lib';
import BigNumber from 'bignumber.js';
import { Neo3TransferService } from '../transfer/neo3-transfer.service';
import { interval } from 'rxjs';
import { take } from 'rxjs/operators';
import { Transaction } from '@cityofzion/neon-core/lib/tx';
import { Transaction as Transaction3 } from '@cityofzion/neon-core-neo3/lib/tx';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { TransferService } from '../transfer/transfer.service';
@Component({
  templateUrl: 'home.component.html',
  styleUrls: ['home.component.scss'],
})
export class PopupHomeComponent implements OnInit, OnDestroy {
  selectedIndex = 0; // asset tab or transaction tab
  balance: Asset;
  rateCurrency: string;

  claimAssetId = GAS3_CONTRACT;
  private status = {
    confirmed: 'confirmed',
    estimated: 'estimated',
    success: 'success',
  };
  claimNumber = 0;
  claimStatus = 'confirmed';
  loading = false;
  private claimsData = null;
  private intervalClaim = null;
  private intervalN3Claim = null;
  showClaim = false;
  init = false;
  ledgerSignLoading = false;
  loadingMsg = '';
  getStatusInterval;

  // 菜单
  showMenu = false;

  private accountSub: Unsubscribable;
  currentWalletIsN3: boolean;
  currentWallet: Wallet2 | Wallet3;
  address: string;
  private chainType: ChainType;
  private currentWalletArr: Array<Wallet2 | Wallet3>;
  private currentWIFArr: string[];
  private n2Network: RpcNetwork;
  private n3Network: RpcNetwork;
  constructor(
    private assetState: AssetState,
    private neon: NeonService,
    private global: GlobalService,
    private transfer: TransferService,
    private dialog: MatDialog,
    private router: Router,
    private neo3TransferService: Neo3TransferService,
    private homeService: HomeService,
    private ledger: LedgerService,
    private chrome: ChromeService,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.currentWIFArr =
        this.chainType === 'Neo2' ? state.neo2WIFArr : state.neo3WIFArr;
      this.currentWalletArr =
        this.chainType === 'Neo2' ? state.neo2WalletArr : state.neo3WalletArr;
      this.currentWalletIsN3 = this.chainType === 'Neo3';
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.initData();
    });
  }

  ngOnInit(): void {
    this.chrome.getStorage(STORAGE_NAME.rateCurrency).subscribe((res) => {
      this.rateCurrency = res;
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
    if (this.intervalN3Claim) {
      clearInterval(this.intervalN3Claim);
    }
    if (this.chainType === 'Neo3') {
      this.homeService.claimTxTime = new Date().getTime();
      this.homeService.claimNumber = this.claimNumber;
      this.homeService.showClaim = this.showClaim;
      this.homeService.loading = this.loading;
    }
  }

  initData() {
    this.claimAssetId = this.chainType === 'Neo2' ? GAS : GAS3_CONTRACT;
    if (
      this.chainType === 'Neo3' &&
      this.homeService.loading &&
      new Date().getTime() - this.homeService.claimTxTime < 20000
    ) {
      this.loading = this.homeService.loading;
      this.showClaim = this.homeService.showClaim;
      this.claimNumber = this.homeService.claimNumber;
      this.getTxStatus();
    }
    this.initClaim();
  }

  initNeo($event) {
    this.balance = $event;
  }

  //#region user click function
  toWeb() {
    this.showMenu = false;
    switch (this.chainType) {
      case 'Neo2':
        if (this.n2Network.explorer) {
          window.open(
            `${this.n2Network.explorer}address/${this.address}/page/1`
          );
        }
        break;
      case 'Neo3':
        if (this.n3Network.explorer) {
          window.open(`${this.n3Network.explorer}address/${this.address}`);
        }
        break;
    }
  }
  removeAccount() {
    this.showMenu = false;
    this.dialog
      .open(PopupConfirmDialogComponent, {
        data: 'delWalletConfirm',
        panelClass: 'custom-dialog-panel',
      })
      .afterClosed()
      .subscribe((confirm) => {
        if (confirm) {
          this.neon.delCurrentWallet().subscribe((w) => {
            if (!w) {
              this.router.navigateByUrl('/popup/wallet/new-guide');
            }
          });
        }
      });
  }

  toAdd() {
    if (this.chainType === 'Neo3' && this.selectedIndex === 1) {
      this.router.navigateByUrl('/popup/add-nft');
    } else {
      this.router.navigateByUrl('/popup/add-asset');
    }
  }
  claim() {
    this.loading = true;
    if (this.claimStatus === this.status.success) {
      this.initClaim();
      return;
    }
    if (this.claimStatus === this.status.estimated) {
      this.syncNow();
      return;
    }
    if (this.chainType === 'Neo2') {
      this.neon.claimNeo2GAS(this.claimsData).then((tx) => {
        if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
          this.getSignTx(tx[0], 'claimNeo2');
        } else {
          tx.forEach((item) => {
            try {
              rpc.Query.sendRawTransaction(item.serialize(true)).execute(
                this.n2Network.rpcUrl
              );
            } catch (error) {
              this.loading = false;
            }
          });
        }
        if (this.intervalClaim === null) {
          this.initInterval();
        }
      });
    } else {
      if (this.intervalN3Claim) {
        clearInterval(this.intervalN3Claim);
      }
      const params = {
        addressFrom: this.address,
        addressTo: this.address,
        tokenScriptHash: NEO3_CONTRACT,
        amount: '0',
        networkFee: '0',
        decimals: 0,
      };
      this.neo3TransferService.createNeo3Tx(params).subscribe(
        (tx) => {
          this.getSignTx(tx, 'claimNeo3');
        },
        (error) => {
          this.loading = false;
          this.global.snackBarTip(error.msg);
        }
      );
    }
  }

  getTxStatus() {
    const queryTxInterval = interval(5000)
      .pipe(take(5))
      .subscribe(() => {
        this.homeService
          .getN3RawTransaction(this.homeService.claimGasHash)
          .then((res) => {
            if (res.blocktime) {
              queryTxInterval.unsubscribe();
              this.loading = false;
              this.claimStatus = this.status.success;
              setTimeout(() => {
                this.initClaim();
              }, 3000);
            }
          });
      });
  }
  cancelLedgerSign() {
    this.ledgerSignLoading = false;
    this.loading = false;
    this.getStatusInterval?.unsubscribe();
  }
  //#endregion

  //#region claim
  private syncNow() {
    this.transfer.create(this.address, this.address, NEO, '1').subscribe(
      async (res) => {
        this.getSignTx(res, 'syncNow');
      },
      (err) => {
        if (this.chainType === 'Neo3' && err) {
          this.global.snackBarTip('wentWrong', err, 10000);
        } else {
          this.global.snackBarTip('wentWrong', err);
        }
      }
    );
  }

  private initClaim() {
    if (this.chainType === 'Neo2') {
      this.assetState.fetchClaim(this.address).subscribe((res: any) => {
        this.claimsData = res.claimable;
        if (res.available > 0) {
          this.claimNumber = res.available;
          this.showClaim = true;
        } else if (res.unavailable > 0) {
          this.claimNumber = res.unavailable;
          this.claimStatus = this.status.estimated;
          this.showClaim = true;
        } else {
          this.showClaim = false;
        }
        this.init = true;
        this.loading = false;
      });
    } else {
      if (
        this.loading &&
        new Date().getTime() - this.homeService.claimTxTime < 20000
      ) {
        return;
      }
      this.getN3UnclaimedGas();
      if (this.intervalN3Claim) {
        clearInterval(this.intervalN3Claim);
      }
      this.intervalN3Claim = setInterval(() => {
        this.getN3UnclaimedGas();
      }, 15000);
    }
  }

  getN3UnclaimedGas() {
    this.assetState.getUnclaimedGas(this.address).subscribe((res) => {
      if (res?.unclaimed && res?.unclaimed !== '0') {
        this.claimNumber = new BigNumber(res?.unclaimed)
          .shiftedBy(-8)
          .toNumber();
        this.claimStatus = this.status.confirmed;
        this.showClaim = true;
      } else {
        this.showClaim = false;
        clearInterval(this.intervalN3Claim);
      }
      this.init = true;
      this.loading = false;
    });
  }

  private initInterval() {
    this.intervalClaim = setInterval(() => {
      this.assetState.fetchClaim(this.address).subscribe((claimRes: any) => {
        if (Number(claimRes.available) === 0) {
          this.loading = false;
          this.claimNumber = claimRes.unavailable;
          clearInterval(this.intervalClaim);
          this.intervalClaim = null;
          this.claimStatus = this.status.success;
        }
      });
    }, 10000);
  }

  private async handleSignedTx(
    tx,
    type: 'claimNeo3' | 'claimNeo2' | 'syncNow'
  ) {
    switch (type) {
      case 'claimNeo2':
        rpc.Query.sendRawTransaction(tx.serialize(true)).execute(
          this.n2Network.rpcUrl
        );
        break;
      case 'claimNeo3':
        this.neo3TransferService.sendNeo3Tx(tx as Transaction3).then((hash) => {
          this.homeService.claimGasHash = hash;
          this.getTxStatus();
        });
        break;
      case 'syncNow':
        try {
          const result = await rpc.Query.sendRawTransaction(
            tx.serialize(true)
          ).execute(this.n2Network.rpcUrl);
          if (result.error === undefined || result.error === null) {
            if (this.intervalClaim === null) {
              this.intervalClaim = setInterval(() => {
                this.assetState
                  .fetchClaim(this.address)
                  .subscribe((claimRes: any) => {
                    if (Number(claimRes.available) !== 0) {
                      this.loading = false;
                      this.claimsData = claimRes.claimable;
                      this.claimNumber = claimRes.available;
                      clearInterval(this.intervalClaim);
                      this.claimStatus = this.status.confirmed;
                      this.intervalClaim = null;
                    }
                  });
              }, 10000);
            } else {
              this.loading = false;
            }
          }
        } catch (error) {
          this.loading = false;
        }
        break;
    }
  }
  private getLedgerStatus(tx, type: 'claimNeo3' | 'claimNeo2' | 'syncNow') {
    this.ledger.getDeviceStatus(this.chainType).then(async (res) => {
      this.loadingMsg =
        this.chainType === 'Neo2'
          ? LedgerStatuses[res].msg
          : LedgerStatuses[res].msgNeo3 || LedgerStatuses[res].msg;
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = 'signTheTransaction';
        this.ledger
          .getLedgerSignedTx(
            tx,
            this.currentWallet,
            this.chainType,
            this.n3Network.magicNumber
          )
          .then((tx) => {
            this.ledgerSignLoading = false;
            this.loadingMsg = '';
            this.handleSignedTx(tx, type);
          })
          .catch((error) => {
            this.loading = false;
            this.ledgerSignLoading = false;
            this.loadingMsg = '';
            this.ledger.handleLedgerError(error);
          });
      }
    });
  }

  private getSignTx(
    tx: Transaction | Transaction3,
    type: 'claimNeo3' | 'claimNeo2' | 'syncNow'
  ) {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.ledgerSignLoading = true;
      this.loadingMsg = LedgerStatuses.DISCONNECTED.msg;
      this.getLedgerStatus(tx, type);
      this.getStatusInterval = interval(5000).subscribe(() => {
        this.getLedgerStatus(tx, type);
      });
      return;
    }
    this.util
      .getWIF(this.currentWIFArr, this.currentWalletArr, this.currentWallet)
      .then((wif) => {
        switch (this.chainType) {
          case 'Neo2':
            tx.sign(wif);
            break;
          case 'Neo3':
            tx.sign(wif, this.n3Network.magicNumber);
            break;
        }
        this.handleSignedTx(tx, type);
      });
  }
  //#endregion
}
