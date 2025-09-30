import { Component, OnDestroy } from '@angular/core';
import { AssetState, GlobalService, HomeState } from '@/app/core';
import { NEO, GAS } from '@/models/models';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet3 } from '@popup/_lib';
import { rpc } from '@cityofzion/neon-core';
import {
  NEO3_CONTRACT,
  GAS3_CONTRACT,
  ChainType,
  RpcNetwork,
} from '../../_lib';
import BigNumber from 'bignumber.js';
import { Neo3TransferService } from '../../transfer/neo3-transfer.service';
import { interval } from 'rxjs';
import { take } from 'rxjs/operators';
import { Transaction } from '@cityofzion/neon-core/lib/tx';
import { Transaction as Transaction3 } from '@cityofzion/neon-core-neo3/lib/tx';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { TransferService } from '../../transfer/transfer.service';
import { EvmWalletJSON } from '../../_lib/evm';

enum ClaimStatus {
  confirmed = 'confirmed',
  estimated = 'estimated',
  success = 'success',
}

@Component({
  selector: 'app-claim-gas',
  templateUrl: 'claim-gas.component.html',
  styleUrls: ['claim-gas.component.scss'],
})
export class PopupClaimGasComponent implements OnDestroy {
  claimAssetId = GAS3_CONTRACT;
  claimNumber = 0;
  claimStatus = 'confirmed';
  loading = false;
  private claimsData = null;
  private intervalClaim = null;
  private intervalN3Claim = null;
  showClaim = false;
  init = false;
  showHardwareSign = false;
  unsignedTx;
  signType;

  private accountSub: Unsubscribable;
  currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  address: string;
  chainType: ChainType;
  private currentWalletArr: Array<Wallet2 | Wallet3>;
  private currentWIFArr: string[];
  private n2Network: RpcNetwork;
  n3Network: RpcNetwork;
  constructor(
    private assetState: AssetState,
    private global: GlobalService,
    private transfer: TransferService,
    private neo3TransferService: Neo3TransferService,
    private homeState: HomeState,
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
      this.n2Network = state.n2Networks[state.n2NetworkIndex];
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.initData();
    });
  }

  ngOnDestroy(): void {
    this.accountSub?.unsubscribe();
    if (this.intervalN3Claim) {
      clearInterval(this.intervalN3Claim);
    }
    if (this.chainType === 'Neo3') {
      this.homeState.claimTxTime = new Date().getTime();
      this.homeState.claimNumber = this.claimNumber;
      this.homeState.showClaim = this.showClaim;
      this.homeState.loading = this.loading;
    }
  }

  private initData() {
    this.claimNumber = 0;
    this.claimStatus = 'confirmed';
    this.claimsData = null;
    this.intervalClaim = null;
    this.intervalN3Claim = null;
    this.showClaim = false;
    this.init = false;

    this.claimAssetId = this.chainType === 'Neo2' ? GAS : GAS3_CONTRACT;
    if (
      this.chainType === 'Neo3' &&
      this.homeState.loading &&
      new Date().getTime() - this.homeState.claimTxTime < 20000
    ) {
      this.loading = this.homeState.loading;
      this.showClaim = this.homeState.showClaim;
      this.claimNumber = this.homeState.claimNumber;
      this.getN3ClaimTxStatus();
    }
    this.initClaim();
  }

  //#region user click function
  claim() {
    this.loading = true;
    if (this.claimStatus === ClaimStatus.success) {
      this.initClaim();
      return;
    }
    if (this.claimStatus === ClaimStatus.estimated) {
      this.syncNow();
      return;
    }
    if (this.chainType === 'Neo2') {
      this.assetState
        .claimNeo2GAS(this.claimsData, this.currentWallet as Wallet2)
        .then((tx) => {
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
    } else if (this.chainType === 'Neo3') {
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

  private getN3ClaimTxStatus() {
    const queryTxInterval = interval(5000)
      .pipe(take(5))
      .subscribe(() => {
        this.homeState
          .getN3RawTransaction(this.homeState.claimGasHash)
          .then((res) => {
            if (res.blocktime) {
              queryTxInterval.unsubscribe();
              this.loading = false;
              this.claimStatus = ClaimStatus.success;
              setTimeout(() => {
                this.initClaim();
              }, 3000);
            }
          });
      });
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
    if (this.intervalN3Claim) {
      clearInterval(this.intervalN3Claim);
    }
    if (this.chainType === 'Neo2') {
      this.assetState.fetchClaim(this.address).subscribe((res: any) => {
        this.claimsData = res.claimable;
        if (res.available > 0) {
          this.claimNumber = res.available;
          this.showClaim = true;
        } else if (res.unavailable > 0) {
          this.claimNumber = res.unavailable;
          this.claimStatus = ClaimStatus.estimated;
          this.showClaim = true;
        } else {
          this.showClaim = false;
        }
        this.init = true;
        this.loading = false;
      });
    } else if (this.chainType === 'Neo3') {
      if (
        this.loading &&
        new Date().getTime() - this.homeState.claimTxTime < 20000
      ) {
        return;
      }
      this.getN3UnclaimedGas();
      this.intervalN3Claim = setInterval(() => {
        this.getN3UnclaimedGas();
      }, 15000);
    }
  }

  private getN3UnclaimedGas() {
    this.assetState.getUnclaimedGas(this.address).subscribe((res) => {
      if (res?.unclaimed && res?.unclaimed !== '0') {
        this.claimNumber = new BigNumber(res?.unclaimed)
          .shiftedBy(-8)
          .toNumber();
        this.claimStatus = ClaimStatus.confirmed;
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
          this.claimStatus = ClaimStatus.success;
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
          this.homeState.claimGasHash = hash;
          this.getN3ClaimTxStatus();
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
                      this.claimStatus = ClaimStatus.confirmed;
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

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      this.handleSignedTx(tx, this.signType);
    } else {
      this.loading = false;
    }
  }

  private getSignTx(
    tx: Transaction | Transaction3,
    type: 'claimNeo3' | 'claimNeo2' | 'syncNow'
  ) {
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.signType = type;
      this.unsignedTx = tx;
      this.showHardwareSign = true;
      return;
    }
    this.global
      .getWIF(
        this.currentWIFArr,
        this.currentWalletArr,
        this.currentWallet as Wallet3
      )
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
