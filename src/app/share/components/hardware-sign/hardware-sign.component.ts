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
import { LedgerService, OneKeyService } from '@/app/core';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { interval } from 'rxjs';
import { ETH_EOA_SIGN_METHODS } from '@/models/evm';
import { PopupQRBasedSignDialogComponent } from '@/app/popup/_dialogs';
import { MatDialog } from '@angular/material/dialog';
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
  oneKeyDetecting = true;
  oneKeyAuthorized = false;
  oneKeyUsbConnected = false;
  oneKeyConnecting = false;
  oneKeyError = '';
  private destroyed = false;

  get oneKeySupported() {
    return this.oneKeyService.supportsWebUsb;
  }

  async connectOneKey() {
    if (!this.oneKeySupported) {
      this.oneKeyDetecting = false;
      return;
    }
    if (this.destroyed || this.oneKeyConnecting || this.oneKeyAuthorized) return;
    this.oneKeyConnecting = true;
    this.oneKeyError = '';
    try {
      const device = await this.oneKeyService.requestDevice();
      if (!device || this.destroyed) return;
      this.oneKeyUsbConnected = true;
      this.oneKeyDetecting = false;
      await this.handleOneKey();
    } catch (error) {
      if (this.destroyed) return;
      this.oneKeyAuthorized = false;
      this.loadingMsg = 'connectOneKeyDevice';
      if (
        error?.name !== 'NotFoundError' &&
        error?.name !== 'SecurityError' &&
        !/device locked|pin cancelled|pin invalid/i.test(error?.message || '')
      ) {
        this.oneKeyError = 'oneKeyConnectionFailed';
      }
    } finally {
      this.oneKeyConnecting = false;
      this.oneKeyDetecting = false;
    }
  }

  constructor(
    private ledger: LedgerService,
    private oneKeyService: OneKeyService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    if (this.currentWallet?.accounts[0].extra?.device === 'QRCode') {
      this.dialog
        .open(PopupQRBasedSignDialogComponent, {
          panelClass: 'custom-dialog-panel',
          backdropClass: 'custom-dialog-backdrop',
          data: {
            unsignedTx: this.unsignedTx,
            unsignedData: this.unsignedData,
            currentWallet: this.currentWallet,
            signMethod: this.signMethod,
          },
        })
        .afterClosed()
        .subscribe((res) => {
          this.backWithSignedTx.emit(res);
        });
    } else {
      this.loadingMsg =
        this.currentWallet.accounts[0].extra?.device === 'OneKey'
          ? 'connectOneKeyDevice'
          : 'connectLedgerDevice';
      if (this.currentWallet.accounts[0].extra?.device === 'OneKey') {
        void this.connectOneKey();
      } else {
        this.handleLedger();
        this.getStatusInterval = interval(5000).subscribe(() => {
          this.handleLedger();
        });
      }
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.currentWallet?.accounts[0].extra?.device === 'OneKey') {
      this.oneKeyService.cancel();
    }
    this.getStatusInterval?.unsubscribe();
  }

  cancelLedgerSign() {
    this.destroyed = true;
    if (this.currentWallet?.accounts[0].extra?.device === 'OneKey') {
      this.oneKeyService.cancel();
    }
    this.backWithSignedTx.emit();
    this.getStatusInterval?.unsubscribe();
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
  private async handleOneKey() {
    const res = await this.oneKeyService.getDeviceStatus();
    if (this.destroyed) return;
    if (res.success === false) throw new Error(res.payload.error);
    if (!res.payload.length) throw new Error('OneKey device unavailable');
    const state = await this.oneKeyService.getPassphraseState();
    if (this.destroyed) return;
    if (state.success === false) throw new Error(state.payload.error);
    this.oneKeyAuthorized = true;
    this.loadingMsg = this.signMethod
      ? 'signOneKeyMessage'
      : 'signOneKeyTransaction';
    try {
      const tx = await (this.signMethod
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
          }));
      if (this.destroyed) return;
      this.loadingMsg = '';
      this.backWithSignedTx.emit(tx);
    } catch (error) {
      if (this.destroyed) return;
      this.loadingMsg = '';
      this.backWithSignedTx.emit();
      this.oneKeyService.handleOneKeyError(error);
    }
  }
}
