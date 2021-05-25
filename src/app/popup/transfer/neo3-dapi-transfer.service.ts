import { Injectable } from '@angular/core';
import { rpc, sc, tx, u, wallet } from '@cityofzion/neon-core-neo3/lib';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { Observable, from } from 'rxjs';
import { AssetState, NotificationService, GlobalService, NeonService } from '@app/core';
import { bignumber } from 'mathjs';
import { NEW_POLICY_CONTRACT } from '../_lib';
import { AuthType } from '@/models/dapi_neo3';

interface CreateNeo3TxInput {
    invokeArgs: any[];
    signers: any[];
    networkFee: number;
}

@Injectable()
export class Neo3DapiTransferService {
    rpcClient;
    constructor(
        public assetState: AssetState,
        public notification: NotificationService,
        private globalService: GlobalService,
        private neon: NeonService,
    ) {
        this.rpcClient = new rpc.RPCClient(this.globalService.Neo3RPCDomain);
    }
    createNeo3Tx(
        params: CreateNeo3TxInput,
    ): Observable<Transaction> {
        const rpcClientTemp = this.rpcClient;
        const neo3This = this;

        const inputs = {
            invokeArgs: params.invokeArgs,
            signers: params.signers,
            systemFee: 0,
            networkFee: bignumber(params.networkFee).toNumber() || 0,
        };
        const vars: any = {};

        /**
         * We will perform the following checks:
         * 1. The token exists. This can be done by performing a invokeFunction call.
         * 2. The amount of token exists on fromAccount.
         * 3. The amount of GAS for fees exists on fromAccount.
         * All these checks can be performed through RPC calls to a NEO node.
         */

        async function createTransaction() {
            let script: string = '';
            try {
                inputs.invokeArgs.forEach((item) => {
                    script += sc.createScript(item);
                })
            } catch (error) {
                throw `createScript: ${error}` ;
            }
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
            const feePerByteInvokeResponse: any = await rpcClientTemp.invokeFunction(
                NEW_POLICY_CONTRACT,
                'getExecFeeFactor',
            );
            if (feePerByteInvokeResponse.state !== 'HALT') {
                if (inputs.networkFee === 0) {
                    throw {
                        msg: 'Unable to retrieve data to calculate network fee.'
                    };
                } else {
                    console.log(
                        '\u001b[31m  ✗ Unable to get information to calculate network fee.  Using user provided value.\u001b[0m'
                    );
                    vars.tx.networkFee = new u.Fixed8(inputs.networkFee);
                }
            }
            const feePerByte = u.Fixed8.fromRawNumber(
                feePerByteInvokeResponse.stack[0].value
            );
            // Account for witness size
            const transactionByteSize = vars.tx.serialize().length / 2 + 109;
            // Hardcoded. Running a witness is always the same cost for the basic account.
            const witnessProcessingFee = u.Fixed8.fromRawNumber(1236390).mul(inputs.invokeArgs.length);
            const networkFeeEstimate = feePerByte
                .mul(transactionByteSize)
                .add(witnessProcessingFee);
            vars.tx.networkFee = new u.Fixed8(inputs.networkFee).add(networkFeeEstimate);
            vars.networkFeeEstimate = networkFeeEstimate;
            console.log(
                `\u001b[32m  ✓ Network Fee set: ${vars.tx.networkFee} \u001b[0m`
            );
        }

        /**
         * SystemFees pay for the processing of the script carried in the transaction. We
         * can easily get this number by using invokeScript with the appropriate signers.
         */
        async function checkSystemFee() {
            let script: string = '';
            try {
                inputs.invokeArgs.forEach((item) => {
                    script += sc.createScript(item);
                })
            } catch (error) {
                throw `createScript: ${error}` ;
            }

            const invokeFunctionResponse = await rpcClientTemp.invokeScript(
                neo3This.hexToBase64(script),
                inputs.signers
            );
            if (invokeFunctionResponse.state !== 'HALT') {
                throw {
                    msg: 'Transfer script errored out! You might not have sufficient funds for this transfer.'
                };
            }
            const requiredSystemFee = u.Fixed8.fromRawNumber(invokeFunctionResponse.gasconsumed);
            if (inputs.systemFee && new u.Fixed8(inputs.systemFee) >= requiredSystemFee) {
                vars.tx.systemFee = new u.Fixed8(inputs.systemFee);
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

    // 字符串转base64
    public hexToBase64(str: string) {
        return Buffer.from(str, 'hex').toString('base64');
    }

    public getTxAuthority(authType: AuthType) {
        let result;
        switch (authType) {
            case AuthType.None:
                result = tx.WitnessScope.None;
                break;
            case AuthType.CalledByEntry:
                result = tx.WitnessScope.CalledByEntry;
                break;
            case AuthType.CustomContracts:
                result = tx.WitnessScope.CustomContracts;
                break;
            case AuthType.CustomGroups:
                result = tx.WitnessScope.CustomGroups;
                break;
            case AuthType.Global:
                result = tx.WitnessScope.Global;
                break;
            default:
                result = tx.WitnessScope.CalledByEntry;
                break;
        }
        return result;
    }
}
