import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChromeService, GlobalService, NeoAssetInfoState } from '@/app/core';
import { convertSignersToObj } from '@/app/core/utils/dapp';
import { requestTargetN3 } from '@/models/dapi_neo3';
import { ERRORS } from '@/models/dapi';
import { wallet } from '@cityofzion/neon-core-neo3';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { RpcNetwork, ChainType, STORAGE_NAME, N3TestnetNetwork, N3MainnetNetwork } from '../../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Unsubscribable } from 'rxjs';
import { Wallet3 } from '@popup/_lib';
import {
  buildSignedContext,
  ContractParametersContextLike,
  deserializeContextTransaction,
} from './neo3-sign-transaction.util';
import {
  analyzeScript,
  DecompiledCall,
} from '../../_lib/script-decompiler';
import {
  buildDecompiledArgVMs,
  DecompiledArgVM,
} from './neo3-sign-transaction.arg-hints';

type TabType = 'details' | 'data';

interface DecompiledCallVM extends DecompiledCall {
  contractName?: string;
  expandArgs?: boolean;
  argsObj: DecompiledArgVM[];
}

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
  magicName: string;
  public signatureOnly = false;
  private invokeArgsArray = {};
  private signTransactionParams: any;
  private context: ContractParametersContextLike | null = null;

  showHardwareSign = false;

  tabType: TabType = 'details';
  decompiledCalls: DecompiledCallVM[] = [];
  signersObj: { name: string; value: string }[] = [];
  expandSigners = false;

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
    private neoAssetInfoState: NeoAssetInfoState,
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
          if (N3TestnetNetwork.magicNumber === this.magicNumber) {
            this.magicName = N3TestnetNetwork.name;
          }
          if (N3MainnetNetwork.magicNumber === this.magicNumber) {
            this.magicName = N3MainnetNetwork.name;
          }

          try {
            if (this.context) {
              this.tx = deserializeContextTransaction(this.context);
              this.txJson = this.tx.export();
            } else {
              this.txJson = this.signTransactionParams.transaction;
              this.tx = new Transaction(this.txJson);
            }
            this.serializeTx = this.tx.serialize(false);
            this.buildSignersObj();
            this.analyzeTxScript();
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

  get hasDetailsTab(): boolean {
    return this.decompiledCalls.length > 0;
  }

  private buildSignersObj() {
    this.signersObj = convertSignersToObj(
      this.tx?.signers?.map((signer) => signer.export()) || [],
    );
  }

  private analyzeTxScript() {
    const scriptHex = this.tx?.script?.toString();
    if (!scriptHex) {
      this.decompiledCalls = [];
      this.tabType = 'data';
      return;
    }
    const result = analyzeScript(scriptHex);
    this.decompiledCalls = result.calls.map((call) => ({
      ...call,
      expandArgs: false,
      argsObj: buildDecompiledArgVMs(call),
    }));
    if (!this.decompiledCalls.length) {
      this.tabType = 'data';
      return;
    }
    this.resolveContractNames();
  }

  private resolveContractNames() {
    if (!this.decompiledCalls.length) {
      return;
    }
    const hashes = Array.from(
      new Set(this.decompiledCalls.map((c) => c.hash).filter(Boolean)),
    );
    if (!hashes.length) {
      return;
    }
    this.neoAssetInfoState
      .getContractManifests(hashes)
      .subscribe((manifests) => {
        this.decompiledCalls.forEach((call) => {
          const idx = hashes.indexOf(call.hash);
          const manifest = idx >= 0 ? manifests[idx] : undefined;
          if (!manifest) {
            return;
          }
          call.contractName = manifest.name;
          const method = manifest.abi?.methods?.find(
            (m) => m.name === call.method,
          );
          if (method) {
            call.argsObj = buildDecompiledArgVMs(call, method.parameters);
          }
        });
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
      if (this.signatureOnly) {
        const publicKey = this.currentWallet?.accounts?.[0]?.extra?.publicKey;
        if (!publicKey) {
          this.sendNotSignableError(
            'Current wallet public key is required for signatureOnly flow',
          );
          return;
        }
        this.sendSignedContext(tx, publicKey);
        return;
      }
      this.tx = tx;
      this.sendMessage();
    }
  }

  public getSignTx() {
    if (!this.currentWallet?.accounts?.[0] || !this.tx) {
      this.sendNotSignableError('Current wallet is unavailable');
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
            this.currentWallet.accounts[0]?.extra?.publicKey ||
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
