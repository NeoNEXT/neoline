import { Injectable } from '@angular/core';
import { CONST, rpc, sc, tx, u, wallet } from '@cityofzion/neon-core-neo3/lib';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { Observable, from } from 'rxjs';
import { AssetState, NotificationService, GlobalService } from '@app/core';
import { bignumber } from 'mathjs';
import { NEO3_VERSION } from '../_lib';

interface CreateNeo3TxInput {
    addressFrom: string;
    addressTo: string;
    tokenScriptHash: string;
    amount: any;
    networkFee: number;
    decimals: number;
}

@Injectable()
export class Neo3TransferService {
    rpcClient;
    constructor(
        public assetState: AssetState,
        public notification: NotificationService,
        private globalService: GlobalService
    ) {
        this.rpcClient = new rpc.RPCClient(this.globalService.Neo3RPCDomain);
    }
    createNeo3Tx(
        params: CreateNeo3TxInput,
        isTransferAll = false
    ): Observable<Transaction> {
        const assetStateTemp = this.assetState;
        const notificationTemp = this.notification;
        const rpcClientTemp = this.rpcClient;
        const neo3This = this;

        const tempScriptHash = wallet.getScriptHashFromAddress(
            params.addressFrom
        );
        params.amount = bignumber(params.amount)
            .mul(bignumber(10).pow(params.decimals))
            .toNumber();
        const inputs = {
            scriptHash: tempScriptHash,
            fromAccountAddress: params.addressFrom,
            toAccountAddress: params.addressTo,
            tokenScriptHash: params.tokenScriptHash,
            amountToTransfer: params.amount,
            systemFee: 0,
            networkFee: bignumber(params.networkFee).times(bignumber(10).pow(8)).toNumber() || 0,
        };
        const vars: any = {};
        const NEW_POLICY_CONTRACT = '0x79bcd398505eb779df6e67e4be6c14cded08e2f2';
        const NEW_GAS = '0x70e2301955bf1e74cbb31d18c2f96972abadb328';

        async function createTransaction() {
            console.log(`\n\n --- Today's Task ---`);
            console.log(
                `Sending ${inputs.amountToTransfer} token \n` +
                    `from ${inputs.fromAccountAddress} \n` +
                    `to ${inputs.toAccountAddress}`
            );

            // Since the token is now an NEP-5 token, we transfer using a VM script.
            const script = sc.createScript({
                scriptHash: inputs.tokenScriptHash,
                operation: 'transfer',
                args: [
                    sc.ContractParam.hash160(inputs.fromAccountAddress),
                    sc.ContractParam.hash160(inputs.toAccountAddress),
                    inputs.amountToTransfer,
                    null,
                ],
            });

            // We retrieve the current block height as we need to
            const currentHeight = await rpcClientTemp.getBlockCount();
            vars.tx = new tx.Transaction({
                version: NEO3_VERSION,
                signers: [
                    {
                        account: inputs.scriptHash,
                        scopes: tx.WitnessScope.CalledByEntry,
                    },
                ],
                validUntilBlock: currentHeight + 30,
                systemFee: vars.systemFee,
                networkFee: vars.networkFee,
                script,
            });
            console.log('\u001b[32m  ✓ Transaction created \u001b[0m');
        }

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
            const networkFee = feePerByteInvokeResponse.gasconsumed;
            const feePerByte = feePerByteInvokeResponse.stack[0].value;
            // 字节费 = 字节长度 * 倍率(feePerByte)
            const transactionByteSize = bignumber(vars.tx.serialize().length / 2 + 109).times(feePerByte);
            const networkFeeEstimate = bignumber(networkFee).plus(transactionByteSize).toNumber();
            vars.tx.networkFee = u.Fixed8.fromRawNumber(bignumber(networkFeeEstimate).plus(inputs.systemFee).toNumber());
            vars.networkFeeEstimate = networkFeeEstimate;
            console.log(
                `\u001b[32m  ✓ Network Fee set: ${vars.tx.networkFee} \u001b[0m`
            );
        }

        async function checkSystemFee() {
            const script = sc.createScript({
                scriptHash: inputs.tokenScriptHash,
                operation: 'transfer',
                args: [
                    sc.ContractParam.hash160(inputs.fromAccountAddress),
                    sc.ContractParam.hash160(inputs.toAccountAddress),
                    inputs.amountToTransfer,
                    null,
                ],
            });
            const invokeFunctionResponse = await rpcClientTemp.invokeScript(
                neo3This.hexToBase64(script),
                [
                    {
                        account: inputs.scriptHash,
                        scopes: tx.WitnessScope.CalledByEntry.toString(),
                    },
                ]
            );
            if (invokeFunctionResponse.state !== 'HALT') {
                throw {
                    msg: 'Transfer script errored out! You might not have sufficient funds for this transfer.'
                };
            }
            // const requiredSystemFee = u.Fixed8.fromRawNumber(invokeFunctionResponse.gasconsumed);
            vars.tx.systemFee = u.Fixed8.fromRawNumber(invokeFunctionResponse.gasconsumed);
            console.log(
                `\u001b[32m  ✓ SystemFee set: ${vars.tx.systemFee.toString()}\u001b[0m`
            );
        }
        

        if (isTransferAll) {
            return from(
                createTransaction()
                    .then(checkNetworkFee)
                    .then(checkSystemFee)
                    .then(() => {
                        return vars.tx;
                    })
            );
        }
        return from(
            createTransaction()
                .then(checkNetworkFee)
                .then(checkSystemFee)
                // .then(checkBalance)
                .then(() => {
                    return vars.tx;
                })
        );
    }

    async sendNeo3Tx(tx1: Transaction): Promise<any> {
        const result = await this.rpcClient.sendRawTransaction(
            this.hexToBase64(tx1.serialize(true))
        );

        console.log('\n\n--- Transaction hash ---');
        return result;
    }

    // 字符串转base64
    hexToBase64(str: string) {
        return Buffer.from(str, 'hex').toString('base64');
    }
}
