import { Injectable } from '@angular/core';
import {
  rpc,
  sc,
  tx,
  u,
  wallet as wallet3,
} from '@cityofzion/neon-core-neo3/lib';
import {
  SignerLike,
  Transaction,
  Witness,
} from '@cityofzion/neon-core-neo3/lib/tx';
import { Observable, from, throwError } from 'rxjs';
import { AssetState, NotificationService, UtilServiceState } from '@app/core';
import BigNumber from 'bignumber.js';
import { ContractCall, ContractParam } from '@cityofzion/neon-core-neo3/lib/sc';
import { GAS3_CONTRACT, RpcNetwork } from '../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

interface CreateNeo3TxInput {
  invokeArgs: ContractCall[];
  signers: SignerLike[];
  networkFee: string;
  systemFee?: any;
  overrideSystemFee?: any;
}

@Injectable()
export class Neo3InvokeService {
  rpcClient;

  private address: string;
  private neo3WIFArr: string[];
  private neo3WalletArr: Wallet3[];
  private n3Network: RpcNetwork;
  constructor(
    public assetState: AssetState,
    public notification: NotificationService,
    private util: UtilServiceState,
    private store: Store<AppState>
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.address = state.currentWallet.accounts[0].address;
      this.neo3WIFArr = state.neo3WIFArr;
      this.neo3WalletArr = state.neo3WalletArr;
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.rpcClient = new rpc.RPCClient(this.n3Network.rpcUrl);
    });
  }
  createNeo3Tx(params: CreateNeo3TxInput): Observable<Transaction> {
    const neo3This = this;
    const rpcClientTemp = this.rpcClient;
    const signerJson = params.signers.map((signerItem) => {
      let scopes = signerItem.scopes;
      if (
        isNaN(Number(signerItem.scopes)) === false &&
        tx.WitnessScope[signerItem.scopes]
      ) {
        scopes = tx.WitnessScope[signerItem.scopes];
      }
      return {
        account: signerItem.account,
        scopes,
        allowedcontracts:
          signerItem?.allowedContracts?.map((item) => item.toString()) || [],
        allowedgroups:
          signerItem?.allowedGroups?.map((item) => item.toString()) || [],
        rules: signerItem?.rules,
      };
    });
    const vars: any = {};
    let script: string = '';
    try {
      script = sc.createScript(...params.invokeArgs);
    } catch (error) {
      return throwError({
        type: 'scriptError',
        error,
      });
    }

    /**
     * We will perform the following checks:
     * 1. The token exists. This can be done by performing a invokeFunction call.
     * 2. The amount of token exists on fromAccount.
     * 3. The amount of GAS for fees exists on fromAccount.
     * All these checks can be performed through RPC calls to a NEO node.
     */

    async function createTransaction() {
      // We retrieve the current block height as we need to
      const currentHeight = await rpcClientTemp.getBlockCount();
      vars.tx = new tx.Transaction({
        signers: params.signers,
        validUntilBlock: currentHeight + 30,
        systemFee: vars.systemFee,
        script,
      });

      console.log('\u001b[32m  ✓ Transaction created \u001b[0m');
    }

    /**
     * Network fees pay for the processing and storage of the transaction in the
     * network. There is a cost incurred per byte of the transaction (without the
     * signatures) and also the cost of running the verification of signatures.
     */
    async function checkNetworkFee() {
      const networkFeeEstimate = await neo3This.calculateNetworkFee(vars.tx);

      vars.tx.networkFee = u.Fixed8.fromRawNumber(
        networkFeeEstimate.toString()
      ).add(new BigNumber(params.networkFee || 0).toFixed());

      console.log(
        `\u001b[32m  ✓ Network Fee set: ${vars.tx.networkFee} \u001b[0m`
      );
    }

    /**
     * SystemFees pay for the processing of the script carried in the transaction. We
     * can easily get this number by using invokeScript with the appropriate signers.
     */
    async function checkSystemFee() {
      if (params.overrideSystemFee) {
        vars.tx.systemFee = u.Fixed8.fromRawNumber(
          new BigNumber(params.overrideSystemFee).shiftedBy(8).toFixed(0)
        );
        return;
      }
      const invokeFunctionResponse = await neo3This.util.n3InvokeScript(
        u.HexString.fromHex(script).toBase64(),
        signerJson
      );
      if (invokeFunctionResponse.state !== 'HALT') {
        throw {
          type: 'rpcError',
          error: invokeFunctionResponse,
        };
      }
      const requiredSystemFee = u.Fixed8.fromRawNumber(
        new BigNumber(invokeFunctionResponse.gasconsumed).times(1.01).toFixed(0)
      );
      vars.tx.systemFee = requiredSystemFee.add(
        new BigNumber(params.systemFee || 0).toFixed()
      );
      console.log(
        `\u001b[32m  ✓ SystemFee set: ${vars.tx.systemFee.toString()}\u001b[0m`
      );
    }

    return from(
      createTransaction()
        .then(checkSystemFee)
        .then(checkNetworkFee)
        .then(() => {
          return vars.tx;
        })
    );
  }

  async sendNeo3Tx(baseTx1: string): Promise<any> {
    const result = await this.rpcClient.sendRawTransaction(baseTx1);

    console.log('\n\n--- Transaction hash ---');
    return result;
  }

  async calculateNetworkFee(txn: tx.Transaction) {
    let txClone = new tx.Transaction({
      signers: txn.signers,
      validUntilBlock: txn.validUntilBlock,
      systemFee: new BigNumber(txn.systemFee.toString())
        .shiftedBy(8)
        .toFixed(0),
      script: txn.script,
    });
    txClone = new tx.Transaction(txClone);
    const wif =
      this.neo3WIFArr[
        this.neo3WalletArr.findIndex(
          (item) => item.accounts[0].address === this.address
        )
      ] || 'KyEUreM7QVQvzUMeGSBTKVtQahKumHyWG6Dj331Vqg5ZWJ8EoaC1';
    txClone.sign(wif, this.n3Network.magicNumber);
    if (txn.signers.length > 1) {
      const addressSign = txClone.witnesses[0];
      const addressIndex = txn.signers.findIndex((item) =>
        item.account
          .toString()
          .includes(wallet3.getScriptHashFromAddress(this.address))
      );
      (txClone as Transaction).witnesses = new Array(txn.signers.length).fill(
        new Witness({ verificationScript: '', invocationScript: '' })
      );
      txClone.witnesses[addressIndex] = addressSign;
    }
    const fee = await this.rpcClient.calculateNetworkFee(txClone);
    return fee;
  }

  public hexToBase64(str: string) {
    return Buffer.from(str, 'hex').toString('base64');
  }

  public createInvokeInputs(data) {
    const { args, scriptHash, operation } = data;
    return {
      scriptHash,
      operation,
      args: args.map((item) => {
        if (item && item.type && item.type === 'Address') {
          return sc.ContractParam.hash160(item.value.toString());
        } else if (item) {
          return ContractParam.fromJson(item);
        } else {
          return null;
        }
      }),
    };
  }
  async isEnoughFee(
    fromAddress: string,
    systemFee,
    networkFee
  ): Promise<boolean> {
    const gasAmount = await this.assetState.getAddressAssetBalance(
      fromAddress,
      GAS3_CONTRACT,
      'Neo3'
    );
    const requireGasAmount = new BigNumber(systemFee.toString()).plus(
      new BigNumber(networkFee.toString())
    );
    if (
      requireGasAmount.comparedTo(new BigNumber(gasAmount).shiftedBy(-8)) > 0
    ) {
      return false;
    }
    return true;
  }
}
