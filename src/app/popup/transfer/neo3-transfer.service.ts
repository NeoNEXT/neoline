import { Injectable } from '@angular/core';
import { rpc, sc, tx, u, wallet } from '@cityofzion/neon-core-neo3/lib';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { Observable, from } from 'rxjs';
import { NeoAssetService } from '@/app/core/services/neo/asset.service';
import { NotificationService } from '@/app/core/services/notification.service';
import { bignumber } from 'mathjs';
import BigNumber from 'bignumber.js';
import { GAS3_CONTRACT, RpcNetwork } from '../_lib';
import { Store } from '@ngrx/store';
import { AppState } from '@/app/reduers';

interface CreateNeo3TxInput {
  addressFrom: string;
  addressTo: string;
  tokenScriptHash: string;
  amount: string | number;
  networkFee: string | number;
  decimals: number;
  nftTokenId?: any;
}

@Injectable()
export class Neo3TransferService {
  private rpcClient;
  private n3Network: RpcNetwork;

  constructor(
    public notification: NotificationService,
    private store: Store<AppState>,
    private neoAssetService: NeoAssetService
  ) {
    const account$ = this.store.select('account');
    account$.subscribe((state) => {
      this.n3Network = state.n3Networks[state.n3NetworkIndex];
      this.rpcClient = new rpc.RPCClient(this.n3Network.rpcUrl);
    });
  }
  createNeo3Tx(
    params: CreateNeo3TxInput,
    isTransferAll = false
  ): Observable<Transaction> {
    const assetStateTemp = this.neoAssetService;
    const notificationTemp = this.notification;
    const rpcClientTemp = this.rpcClient;
    const neo3This = this;

    const tempScriptHash = wallet.getScriptHashFromAddress(params.addressFrom);
    params.amount = bignumber(params.amount)
      .mul(bignumber(10).pow(params.decimals))
      .toFixed();
    const inputs = {
      scriptHash: tempScriptHash,
      fromAccountAddress: params.addressFrom,
      toAccountAddress: params.addressTo,
      tokenScriptHash: params.tokenScriptHash,
      amountToTransfer: params.amount,
      systemFee: u.BigInteger.fromNumber(0),
      networkFee: u.BigInteger.fromDecimal(params.networkFee, 8),
    };
    const vars: any = {};
    const NEW_GAS = '0xd2a4cff31913016155e38e474a2c06d08be276cf';

    /**
     * We will perform the following checks:
     * 1. The token exists. This can be done by performing a invokeFunction call.
     * 2. The amount of token exists on fromAccount.
     * 3. The amount of GAS for fees exists on fromAccount.
     * All these checks can be performed through RPC calls to a NEO node.
     */

    // Since the token is now an NEP-5 token, we transfer using a VM script.
    let script;
    if (params.nftTokenId) {
      script = sc.createScript({
        scriptHash: inputs.tokenScriptHash,
        operation: 'transfer',
        args: [
          sc.ContractParam.hash160(inputs.toAccountAddress),
          sc.ContractParam.byteArray(u.hex2base64(params.nftTokenId)),
          sc.ContractParam.any(null),
        ],
      });
    } else {
      script = sc.createScript({
        scriptHash: inputs.tokenScriptHash,
        operation: 'transfer',
        args: [
          sc.ContractParam.hash160(inputs.fromAccountAddress),
          sc.ContractParam.hash160(inputs.toAccountAddress),
          sc.ContractParam.integer(inputs.amountToTransfer),
          sc.ContractParam.any(null),
        ],
      });
    }

    async function createTransaction() {
      console.log(`\n\n --- Today's Task ---`);
      console.log(
        `Sending ${inputs.amountToTransfer} token \n` +
          `from ${inputs.fromAccountAddress} \n` +
          `to ${inputs.toAccountAddress}`
      );

      // We retrieve the current block height as we need to
      const currentHeight = await rpcClientTemp.getBlockCount();
      vars.tx = new tx.Transaction({
        signers: [
          {
            account: inputs.scriptHash,
            scopes: tx.WitnessScope.CalledByEntry,
          },
        ],
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
        inputs.networkFee
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
      const invokeFunctionResponse = await rpcClientTemp.invokeScript(
        neo3This.hexToBase64(script),
        [
          {
            account: inputs.scriptHash,
            scopes: tx.WitnessScope[tx.WitnessScope.CalledByEntry],
          },
        ]
      );
      if (invokeFunctionResponse.state !== 'HALT') {
        throw {
          msg:
            invokeFunctionResponse?.error ||
            invokeFunctionResponse?.message ||
            invokeFunctionResponse?.exception ||
            'Transfer script errored out! You might not have sufficient funds for this transfer.',
        };
      }
      const requiredSystemFee = u.BigInteger.fromNumber(
        invokeFunctionResponse.gasconsumed
      );
      if (
        inputs.systemFee &&
        inputs.systemFee.compare(requiredSystemFee) >= 0
      ) {
        vars.tx.systemFee = inputs.systemFee;
        console.log(
          `  i Node indicates ${requiredSystemFee} systemFee but using user provided value of ${inputs.systemFee}`
        );
      } else {
        vars.tx.systemFee = requiredSystemFee;
      }
      console.log(
        `\u001b[32m  ✓ SystemFee set: ${vars.tx.systemFee.toString()}\u001b[0m`
      );
    }

    /**
     * We will also need to check that the inital address has sufficient funds for the transfer.
     * We look for both funds of the token we intend to transfer and GAS required to pay for the transaction.
     * For this, we rely on the NEP5Tracker plugin. Hopefully, the node we select has the plugin installed.
     */
    async function checkBalance() {
      // Check for gas funds for fees
      const gasRequirements = new BigNumber(vars.tx.networkFee)
        .plus(vars.tx.systemFee)
        .shiftedBy(-8);
      let gasAmount = await assetStateTemp.getAddressAssetBalance(
        inputs.fromAccountAddress,
        GAS3_CONTRACT,
        'Neo3'
      );
      gasAmount = new BigNumber(gasAmount).shiftedBy(-8).toFixed();
      if (new BigNumber(gasAmount).comparedTo(gasRequirements) < 0) {
        throw {
          msg: `${
            notificationTemp.content.insufficientBalance
          } ${gasRequirements} ${
            notificationTemp.content.butOnlyHad
          } ${gasAmount.toString()}`,
        };
      } else {
        console.log(
          `\u001b[32m  ✓ Sufficient GAS for fees found (${gasRequirements}) \u001b[0m`
        );
      }
      if (!params.nftTokenId) {
        // Check for token funds
        const balanceAmountInt = await assetStateTemp.getAddressAssetBalance(
          inputs.fromAccountAddress,
          inputs.tokenScriptHash,
          'Neo3'
        );
        const balanceAmount = new BigNumber(balanceAmountInt)
          .shiftedBy(-params.decimals)
          .toFixed();
        if (
          new BigNumber(balanceAmountInt).comparedTo(
            new BigNumber(inputs.amountToTransfer)
          ) < 0
        ) {
          throw {
            msg: `${notificationTemp.content.balanceLack} ${balanceAmount}`,
          };
        } else {
          console.log('\u001b[32m  ✓ Token funds found \u001b[0m');
        }

        // 如果转的是 gas
        if (inputs.tokenScriptHash.indexOf(NEW_GAS) >= 0) {
          const totalRequirements = new BigNumber(inputs.amountToTransfer)
            .shiftedBy(-8)
            .plus(gasRequirements);
          if (new BigNumber(balanceAmount).comparedTo(totalRequirements) < 0) {
            throw {
              msg: `${notificationTemp.content.insufficientSystemFee} ${balanceAmount}`,
            };
          }
        }
      }
    }

    if (isTransferAll) {
      return from(
        createTransaction()
          .then(checkSystemFee)
          .then(checkNetworkFee)
          .then(() => {
            return vars.tx;
          })
      );
    }

    return from(
      createTransaction()
        .then(checkSystemFee)
        .then(checkNetworkFee)
        .then(checkBalance)
        .then(() => {
          return vars.tx;
        })
    );
  }

  async calculateNetworkFee(txn) {
    let txClone = txn.export();
    txClone = new tx.Transaction(txClone);
    const wif = 'KyEUreM7QVQvzUMeGSBTKVtQahKumHyWG6Dj331Vqg5ZWJ8EoaC1';
    txClone.sign(wif, this.n3Network.magicNumber);
    const fee = await this.rpcClient.calculateNetworkFee(txClone);
    return fee;
  }

  async sendNeo3Tx(tx1: Transaction): Promise<any> {
    const result = await this.rpcClient.sendRawTransaction(
      this.hexToBase64(tx1.serialize(true))
    );

    console.log('\n\n--- Transaction hash ---');
    return result;
  }

  // 字符串转base64
  public hexToBase64(str: string) {
    return Buffer.from(str, 'hex').toString('base64');
  }
}
