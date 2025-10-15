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
import { Neo3Service, NotificationService, NeoAssetService } from '@app/core';
import BigNumber from 'bignumber.js';
import { GAS3_CONTRACT, RpcNetwork } from '../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';

interface CreateNeo3TxInput {
  invokeArgs: sc.ContractCall[];
  signers: SignerLike[];
  networkFee: string;
  systemFee?: any;
  overrideSystemFee?: any;
}

@Injectable()
export class Neo3InvokeService {
  rpcClient;

  private address: string;
  private n3Network: RpcNetwork;
  constructor(
    public notification: NotificationService,
    private store: Store<AppState>,
    private neo3Service: Neo3Service,
    private neoAssetService: NeoAssetService
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.address = state.currentWallet?.accounts[0]?.address;
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

      vars.tx.networkFee = u.BigInteger.fromNumber(networkFeeEstimate).add(
        u.BigInteger.fromDecimal(params.networkFee || 0, 8)
      );

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
        vars.tx.systemFee = u.BigInteger.fromDecimal(
          params.overrideSystemFee,
          8
        );
        return;
      }
      const invokeFunctionResponse = await neo3This.neo3Service.n3InvokeScript(
        u.HexString.fromHex(script).toBase64(),
        signerJson
      );
      if (invokeFunctionResponse.state !== 'HALT') {
        throw {
          type: 'rpcError',
          error: invokeFunctionResponse,
        };
      }
      // Some contracts may have uncertain system fees
      const requiredSystemFee = u.BigInteger.fromNumber(
        new BigNumber(invokeFunctionResponse.gasconsumed).times(1.01).toFixed(0)
      );
      vars.tx.systemFee = requiredSystemFee.add(
        u.BigInteger.fromDecimal(params.systemFee || 0, 8)
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
      systemFee: txn.systemFee,
      script: txn.script,
    });
    txClone = new tx.Transaction(txClone);
    const wif = 'KyEUreM7QVQvzUMeGSBTKVtQahKumHyWG6Dj331Vqg5ZWJ8EoaC1';
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

  public handleInvokeArgs(args: any[]) {
    return args.map((item) => {
      if (item && item.type && item.type === 'Address') {
        return sc.ContractParam.hash160(item.value.toString());
      } else if (item) {
        return sc.ContractParam.fromJson(item);
      } else {
        return null;
      }
    });
  }
  async isEnoughFee(
    fromAddress: string,
    systemFee,
    networkFee
  ): Promise<boolean> {
    const gasAmount = await this.neoAssetService.getAddressAssetBalance(
      fromAddress,
      GAS3_CONTRACT,
      'Neo3'
    );
    const requireGasAmount = new BigNumber(systemFee).plus(
      new BigNumber(networkFee)
    );
    if (requireGasAmount.comparedTo(new BigNumber(gasAmount)) > 0) {
      return false;
    }
    return true;
  }
}
