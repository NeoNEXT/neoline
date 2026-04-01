import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, GlobalService } from '@/app/core';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import { wallet } from '@cityofzion/neon-core-neo3';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { RpcNetwork, ChainType, STORAGE_NAME } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet3 } from '@popup/_lib';
import {
  buildSignedContext,
  ContractParametersContextLike,
  deserializeContextTransaction,
} from './neo3-sign-transaction.util';

@Component({
  templateUrl: './neo3-sign-transaction.component.html',
  styleUrls: ['./neo3-sign-transaction.component.scss'],
})
export class PopupNoticeNeo3SignTransactionComponent implements OnInit {
  public tx: Transaction;
  public txJson;
  public serializeTx: string;
  private messageID = 0;
  public magicNumber;
  public signatureOnly = false;
  private invokeArgsArray = {};
  private signTransactionParams: any;
  private context: ContractParametersContextLike | null = null;

  showHardwareSign = false;

  private accountSub: Unsubscribable;
  public address: string;
  public n3Network: RpcNetwork;
  currentWallet: Wallet3;
  chainType: ChainType;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];
  constructor(
    private aRouter: ActivatedRoute,
    private chrome: ChromeService,
    private global: GlobalService,
    private store: Store<AppState>,
  ) {
    const account$ = this.store.select('account');
    this.accountSub = account$.subscribe((state) => {
      this.chainType = state.currentChainType;
      this.currentWallet = state.currentWallet as Wallet3;
      this.address = state.currentWallet?.accounts[0]?.address;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
    });
  }

  ngOnInit() {
    this.aRouter.queryParams.subscribe(({ messageID }) => {
      this.messageID = messageID;
      this.chrome
        .getStorage(STORAGE_NAME.InvokeArgsArray)
        .subscribe((invokeArgsArray) => {
          this.invokeArgsArray = invokeArgsArray || {};
          this.signTransactionParams = this.invokeArgsArray[this.messageID];
          if (!this.signTransactionParams) {
            return;
          }
          this.signatureOnly = !!this.signTransactionParams.context;
          this.context = this.signTransactionParams.context || null;
          this.magicNumber = Number(
            this.signTransactionParams.magicNumber ?? this.context?.network,
          );

          try {
            if (this.context) {
              this.tx = deserializeContextTransaction(this.context);
              this.txJson = this.tx.export();
            } else {
              this.txJson = this.signTransactionParams.transaction;
              this.tx = new Transaction(this.txJson);
            }
            this.serializeTx = this.tx.serialize(false);
          } catch (error) {
            this.chrome.windowCallback(
              {
                error: {
                  ...ERRORS.MALFORMED_INPUT,
                  description: error?.message || error,
                },
                return: requestTargetN3.SignTransaction,
                ID: this.messageID,
              },
              true,
            );
          }
        });
      window.onbeforeunload = () => {
        this.clearStoredParams();
        this.chrome.windowCallback({
          error: ERRORS.CANCELLED,
          return: requestTargetN3.SignTransaction,
          ID: this.messageID,
        });
      };
    });
  }

  private clearStoredParams() {
    if (this.invokeArgsArray?.[this.messageID]) {
      delete this.invokeArgsArray[this.messageID];
      this.chrome.setStorage(
        STORAGE_NAME.InvokeArgsArray,
        this.invokeArgsArray,
      );
    }
  }

  public cancel() {
    this.clearStoredParams();
    this.chrome.windowCallback(
      {
        error: ERRORS.CANCELLED,
        return: requestTargetN3.SignTransaction,
        ID: this.messageID,
      },
      true,
    );
  }

  private sendMessage() {
    this.clearStoredParams();
    this.chrome.windowCallback(
      {
        return: requestTargetN3.SignTransaction,
        data: this.tx.export(),
        ID: this.messageID,
      },
      true,
    );
  }

  private normalizeScriptHash(hash: any): string {
    return String(hash || '')
      .replace(/^0x/i, '')
      .toLowerCase();
  }

  private getSignerAccountHash(signer: any): string {
    if (!signer) {
      return '';
    }
    const signerHash =
      signer?.account?.toBigEndian?.() ??
      signer?.account?.toString?.() ??
      signer?.account;
    return this.normalizeScriptHash(signerHash);
  }

  private getCurrentWalletAccountHash() {
    return this.normalizeScriptHash(
      wallet.getScriptHashFromAddress(this.currentWallet.accounts[0].address),
    );
  }

  private sendNotSignableError(description: string) {
    this.clearStoredParams();
    this.chrome.windowCallback(
      {
        error: {
          ...ERRORS.MALFORMED_INPUT,
          description,
        },
        return: requestTargetN3.SignTransaction,
        ID: this.messageID,
      },
      true,
    );
  }

  private verifyCurrentWalletCanSign() {
    if (!this.currentWallet?.accounts?.[0] || !this.tx) {
      this.sendNotSignableError('Current wallet is unavailable');
      return null;
    }

    const currentAccountHash = this.getCurrentWalletAccountHash();
    const isSigner = (this.tx.signers || []).some(
      (signer) => this.getSignerAccountHash(signer) === currentAccountHash,
    );
    if (!isSigner) {
      this.sendNotSignableError(
        'Current account is not a signer in this transaction',
      );
      return null;
    }

    return {
      accountHash: currentAccountHash,
      publicKey: this.currentWallet.accounts[0]?.extra?.publicKey,
    };
  }

  private sendSignedContext(signature: string, publicKey: string) {
    if (!this.context) {
      this.sendNotSignableError('Missing transaction context');
      return;
    }
    try {
      const signedContext = buildSignedContext({
        context: this.context,
        account: this.currentWallet.accounts[0],
        publicKey,
        signature,
      });
      this.clearStoredParams();
      this.chrome.windowCallback(
        {
          return: requestTargetN3.SignTransaction,
          data: signedContext,
          ID: this.messageID,
        },
        true,
      );
    } catch (error) {
      this.sendNotSignableError(error?.message || error);
    }
  }

  handleHardwareSignedTx(tx) {
    this.showHardwareSign = false;
    if (tx) {
      const currentSigner = this.verifyCurrentWalletCanSign();
      if (!currentSigner) {
        return;
      }
      if (this.signatureOnly) {
        if (!currentSigner.publicKey) {
          this.sendNotSignableError(
            'Current wallet public key is required for signatureOnly flow',
          );
          return;
        }
        this.sendSignedContext(tx, currentSigner.publicKey);
        return;
      }
      this.tx = tx;
      this.sendMessage();
    }
  }

  public getSignTx() {
    const currentSigner = this.verifyCurrentWalletCanSign();
    if (!currentSigner) {
      return;
    }
    if (this.currentWallet.accounts[0]?.extra?.ledgerSLIP44) {
      this.showHardwareSign = true;
      return;
    }
    this.global
      .getWIF(this.neo3WIFArr, this.neo3WalletArr, this.currentWallet)
      .then((wif) => {
        if (this.signatureOnly) {
          const privateKey = wallet.getPrivateKeyFromWIF(wif);
          const publicKey =
            currentSigner.publicKey ||
            wallet.getPublicKeyFromPrivateKey(privateKey);
          const signature = wallet.sign(
            this.tx.getMessageForSigning(
              this.magicNumber ?? this.n3Network.magicNumber,
            ),
            privateKey,
          );
          this.sendSignedContext(signature, publicKey);
          return;
        }
        this.tx.sign(wif, this.magicNumber ?? this.n3Network.magicNumber);
        this.sendMessage();
      });
  }
}
