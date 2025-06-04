import {
  Component,
  OnInit,
  Input,
  OnDestroy,
  Output,
  EventEmitter,
} from '@angular/core';
import {
  ChainType,
  EvmWalletJSON,
  LedgerStatuses,
  Wallet3,
} from '@/app/popup/_lib';
import { LedgerService, OneKeyService, SettingState } from '@/app/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { interval } from 'rxjs';
import { ETH_EOA_SIGN_METHODS } from '@/models/evm';

@Component({
  selector: 'app-hardware-sign',
  templateUrl: 'hardware-sign.component.html',
  styleUrls: ['hardware-sign.component.scss'],
})
export class HardwareSignComponent implements OnInit, OnDestroy {
  @Input() chainType: ChainType;
  @Input() unsignedTx;
  @Input() unsignedData;
  @Input() signMethod;
  @Input() magicNumber: number;
  @Input() signOnly = false;
  @Input() currentWallet: Wallet2 | Wallet3 | EvmWalletJSON;
  @Output() backWithSignedTx = new EventEmitter();

  loadingMsg = '';
  getStatusInterval;
  hasInstallOneKeyBridge = true;
  lang = 'en';

  constructor(
    private ledger: LedgerService,
    private oneKeyService: OneKeyService,
    private setting: SettingState
  ) {}

  ngOnInit(): void {
    this.loadingMsg =
      this.currentWallet.accounts[0].extra?.device === 'OneKey'
        ? 'connectOneKeyDevice'
        : 'connectLedgerDevice';
    this.getLedgerStatus();
    this.getStatusInterval = interval(5000).subscribe(() => {
      this.getLedgerStatus();
    });
    this.setting.langSub.subscribe((lang) => {
      this.lang = lang;
    });
  }

  ngOnDestroy(): void {
    this.getStatusInterval?.unsubscribe();
  }

  cancelLedgerSign() {
    this.backWithSignedTx.emit();
    this.getStatusInterval?.unsubscribe();
  }

  private getLedgerStatus() {
    if (this.currentWallet.accounts[0].extra?.device !== 'OneKey') {
      this.handleLedger();
    }
    if (this.currentWallet.accounts[0].extra?.device === 'OneKey') {
      this.handleOneKey();
    }
  }

  private handleLedger() {
    this.ledger.getDeviceStatus(this.chainType).then(async (res) => {
      switch (this.chainType) {
        case 'Neo2':
          this.loadingMsg = LedgerStatuses[res].msg;
          break;
        case 'Neo3':
          this.loadingMsg =
            LedgerStatuses[res].msgNeo3 || LedgerStatuses[res].msg;
          break;
        case 'NeoX':
          this.loadingMsg =
            LedgerStatuses[res].msgNeoX || LedgerStatuses[res].msg;
          break;
      }
      if (LedgerStatuses[res] === LedgerStatuses.READY) {
        this.getStatusInterval.unsubscribe();
        this.loadingMsg = this.signMethod
          ? 'signLedgerMessage'
          : 'signLedgerTransaction';
        (this.signMethod
          ? this.signMethod === ETH_EOA_SIGN_METHODS.PersonalSign
            ? this.ledger.getNeoXSignPersonalMessage(
                this.unsignedData,
                this.currentWallet as EvmWalletJSON
              )
            : this.ledger.getNeoXSignTypedData(
                this.unsignedData,
                this.currentWallet as EvmWalletJSON
              )
          : this.ledger.getLedgerSignedTx(
              this.unsignedTx,
              this.currentWallet,
              this.chainType,
              this.magicNumber,
              this.signOnly
            )
        )
          .then((tx) => {
            this.loadingMsg = '';
            this.backWithSignedTx.emit(tx);
          })
          .catch((error) => {
            this.loadingMsg = '';
            this.backWithSignedTx.emit();
            this.ledger.handleLedgerError(error);
          });
      }
    });
  }
  private handleOneKey() {
    this.oneKeyService.getDeviceStatus().then((res) => {
      if (!res.success && 'code' in res.payload && res.payload.code === 808) {
        this.hasInstallOneKeyBridge = false;
      }
      if (res.success && res.payload.length > 0) {
        this.hasInstallOneKeyBridge = true;
        this.getStatusInterval?.unsubscribe();
        this.oneKeyService.getPassphraseState().then((state) => {
          if (state.success) {
            this.loadingMsg = this.signMethod
              ? 'signOneKeyMessage'
              : 'signOneKeyTransaction';
            (this.signMethod
              ? this.signMethod === ETH_EOA_SIGN_METHODS.PersonalSign
                ? this.oneKeyService.signEvmPersonalMessage(
                    this.unsignedData,
                    this.currentWallet as EvmWalletJSON
                  )
                : this.oneKeyService.signEvmTypedData(
                    this.unsignedData,
                    this.currentWallet as EvmWalletJSON
                  )
              : this.oneKeyService.signTransaction({
                  wallet: this.currentWallet as Wallet3 | EvmWalletJSON,
                  unsignedTx: this.unsignedTx,
                  chainType: this.chainType,
                  magicNumber: this.magicNumber,
                  signOnly: this.signOnly,
                })
            )
              .then((tx) => {
                this.loadingMsg = '';
                this.backWithSignedTx.emit(tx);
              })
              .catch((error) => {
                this.loadingMsg = '';
                this.backWithSignedTx.emit();
                this.oneKeyService.handleOneKeyError(error);
              });
          }
        });
      }
    });
  }

  toInstallOneKeyBridge() {
    this.oneKeyService.toInstallOneKeyBridge(this.lang);
  }
}
