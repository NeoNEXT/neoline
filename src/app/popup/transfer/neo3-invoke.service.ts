import { Injectable } from '@angular/core';
import { rpc, sc, tx, u, wallet as wallet3 } from '@cityofzion/neon-core-neo3/lib';
import { SignerLike, Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { Observable, from, throwError } from 'rxjs';
import { AssetState, NotificationService, GlobalService } from '@app/core';
import { ContractCall, ContractParam } from '@cityofzion/neon-core-neo3/lib/sc';

interface CreateNeo3TxInput {
    invokeArgs: ContractCall[];
    signers: SignerLike[];
    networkFee: number;
}

@Injectable()
export class Neo3InvokeService {
    rpcClient;
    constructor(
        public assetState: AssetState,
        public notification: NotificationService,
        private globalService: GlobalService,
    ) {
        this.rpcClient = new rpc.RPCClient(this.globalService.Neo3RPCDomain);
    }
    createNeo3Tx(
        params: CreateNeo3TxInput,
    ): Observable<Transaction> {
        const neo3This = this;
        const rpcClientTemp = this.rpcClient;
        const signerJson = params.signers.map(signerItem => {
            return {
                account: signerItem.account,
                scopes: signerItem.scopes,
                allowedcontracts: signerItem?.allowedContracts?.map((item) => item.toString()) ||
                    undefined,
                allowedgroups: signerItem?.allowedGroups?.map((item) => item.toString()) ||
                    undefined
            }
        });
        const inputs = {
            invokeArgs: params.invokeArgs,
            signers: params.signers,
            systemFee: 0,
            networkFee: params.networkFee || 0,
        };
        const vars: any = {};
        let script: string = '';
        try {
            script = sc.createScript(...params.invokeArgs);
        } catch (error) {
            return throwError({
                type: 'scriptError',
                error
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
                signers: inputs.signers,
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
            const { feePerByte, executionFeeFactor } = await neo3This.getFeeInformation(
                rpcClientTemp
            );
            const networkFeeEstimate = await neo3This.calculateNetworkFee(
                vars.tx,
                feePerByte,
                executionFeeFactor,
                inputs,
                signerJson
            );
            vars.tx.networkFee = u.Fixed8.fromRawNumber(networkFeeEstimate.toString()).add(
                params.networkFee
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
                u.HexString.fromHex(script),
                signerJson
            );
            if (invokeFunctionResponse.state !== 'HALT') {
                throw {
                    type: 'rpcError',
                    error: invokeFunctionResponse
                };
            }
            const requiredSystemFee = u.Fixed8.fromRawNumber(
                invokeFunctionResponse.gasconsumed
            );
            vars.tx.systemFee = requiredSystemFee;
            console.log(
                `\u001b[32m  ✓ SystemFee set: ${vars.tx.systemFee.toString()}\u001b[0m`
            );
        }

        return from(
            createTransaction()
                .then(checkNetworkFee)
                .then(checkSystemFee)
                .then(() => {
                    return vars.tx;
                })
        );
    }

    async sendNeo3Tx(baseTx1: string): Promise<any> {
        const result = await this.rpcClient.sendRawTransaction(
            baseTx1
        );

        console.log('\n\n--- Transaction hash ---');
        return result;
    }

    public async getFeeInformation(client) {
        const policyScript = new sc.ScriptBuilder()
            .emitContractCall(sc.PolicyContract.INSTANCE.getFeePerByte())
            .emitContractCall(sc.PolicyContract.INSTANCE.getExecFeeFactor())
            .build();
        const res = await client.invokeScript(u.HexString.fromHex(policyScript));
        const [feePerByte, executionFeeFactor] = res.stack.map((s) =>
            u.BigInteger.fromNumber(s.value)
        );
        return { feePerByte, executionFeeFactor };
    }

    public generateFakeInvocationScript() {
        return new sc.OpToken(sc.OpCode.PUSHDATA1, '0'.repeat(128));
    }

    public async calculateNetworkFee(
        txn,
        feePerByte,
        executionFeeFactor,
        params,
        signerJson
      ) {
        const feePerByteBigInteger =
          feePerByte instanceof u.BigInteger
            ? feePerByte
            : u.BigInteger.fromNumber(feePerByte);
        const txClone = new tx.Transaction(txn);
        const witnesses: any[] = params.invokeArgs.map((item) => {
          return new tx.Witness({
            verificationScript: '00'.repeat(40),
            invocationScript: '',
          });
        });
        txClone.witnesses = witnesses;
        txClone.witnesses = txn.witnesses.map((w) => {
          const verificationScript = w.verificationScript;
          if (sc.isMultisigContract(verificationScript)) {
            const threshold = wallet3.getSigningThresholdFromVerificationScript(
              verificationScript.toBigEndian()
            );
            return new tx.Witness({
              invocationScript: this.generateFakeInvocationScript()
                .toScript()
                .repeat(threshold),
              verificationScript,
            });
          } else {
            return new tx.Witness({
              invocationScript: this.generateFakeInvocationScript().toScript(),
              verificationScript,
            });
          }
        });
        let verificationExecutionFee = await params.invokeArgs.reduce(
          async (totalFee, item) => {
            let fee = u.BigInteger.fromNumber(0);
            try {
              const invokeFunctionResponse = await this.rpcClient.invokeContractVerify(
                item.scriptHash,
                [],
                signerJson
              );
              if (invokeFunctionResponse.state === 'HALT') {
                fee = u.BigInteger.fromNumber(invokeFunctionResponse.gasconsumed);
              }
            } catch (error) {
              console.log(error);
            }
            return totalFee.add(fee);
          },
          u.BigInteger.fromNumber(0)
        );
        const defaultVerificationExecutionFee = u.BigInteger.fromNumber(1007000);
        if (verificationExecutionFee.compare(defaultVerificationExecutionFee) < 0) {
          verificationExecutionFee = defaultVerificationExecutionFee;
        }
        const sizeFee = feePerByteBigInteger.mul(txClone.serialize(true).length / 2);
        return sizeFee.add(verificationExecutionFee);
      }

    public hexToBase64(str: string) {
        return Buffer.from(str, 'hex').toString('base64');
    }

    public createInvokeInputs(data) {
        const { args, scriptHash, operation } = data;
        return {
            scriptHash,
            operation,
            args: args.map(item => {
                if (item && item.type && item.type === 'Address') {
                    return sc.ContractParam.hash160(item.value.toString());
                } else if (item) {
                    return ContractParam.fromJson(item);
                } else {
                    return null;
                }
            })
        }
    }
}
