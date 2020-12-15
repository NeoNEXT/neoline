import { Injectable } from '@angular/core';
import { CONST, rpc, sc, tx, u, wallet } from '@cityofzion/neon-core-neo3';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { Observable, from } from 'rxjs';
import { NEO3_RPC_HOST } from '@popup/_lib';
import { AssetState } from '@app/core';
import { bignumber } from 'mathjs';

const rpcClient = new rpc.RPCClient(NEO3_RPC_HOST);

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
    constructor(public assetState: AssetState) {}
    createNeo3Tx(params: CreateNeo3TxInput, isTransferAll = false): Observable<Transaction> {
        const assetStateTemp = this.assetState;
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
                ],
            });

            // We retrieve the current block height as we need to
            const currentHeight = await rpcClient.getBlockCount();
            vars.tx = new tx.Transaction({
                sender: inputs.scriptHash as any,
                signers: [
                    {
                        account: inputs.scriptHash,
                        scopes: tx.WitnessScope.CalledByEntry,
                    },
                ],
                validUntilBlock: currentHeight + 1000000,
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
            const feePerByteInvokeResponse: any = await rpcClient.invokeFunction(
                CONST.NATIVE_CONTRACTS.POLICY,
                'getFeePerByte'
            );

            if (feePerByteInvokeResponse.state !== 'HALT') {
                if (inputs.networkFee === 0) {
                    throw new Error(
                        'Unable to retrieve data to calculate network fee.'
                    );
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
            const witnessProcessingFee = u.Fixed8.fromRawNumber(1000390);
            const networkFeeEstimate = feePerByte
                .mul(transactionByteSize)
                .add(witnessProcessingFee);
            vars.tx.networkFee = new u.Fixed8(
                inputs.networkFee + networkFeeEstimate.toNumber()
            );
            vars.networkFeeEstimate = networkFeeEstimate;
            console.log(
                `\u001b[32m  ✓ Network Fee set: ${vars.tx.networkFee} \u001b[0m`
            );
        }

        /**
         * First, we check that the token exists. We perform an invokeFunction RPC call
         * which calls the `name` method of the contract. The VM should exit successfully
         * with `HALT` and give us the token name if it exists.
         */
        async function checkToken() {
            const tokenNameResponse: any = await rpcClient.invokeFunction(
                inputs.tokenScriptHash,
                'name'
            );

            if (tokenNameResponse.state !== 'HALT') {
                throw new Error(
                    'Token not found! Please check the provided tokenScriptHash is correct.'
                );
            }

            vars.tokenName = u.HexString.fromBase64(
                tokenNameResponse.stack[0].value
            ).toAscii();

            console.log('\u001b[32m  ✓ Token found \u001b[0m');
        }

        /**
         * SystemFees pay for the processing of the script carried in the transaction. We
         * can easily get this number by using invokeScript with the appropriate signers.
         */
        async function checkSystemFee() {
            const script = sc.createScript({
                scriptHash: inputs.tokenScriptHash,
                operation: 'transfer',
                args: [
                    sc.ContractParam.hash160(inputs.fromAccountAddress),
                    sc.ContractParam.hash160(inputs.toAccountAddress),
                    inputs.amountToTransfer,
                ],
            });
            const invokeFunctionResponse = await rpcClient.invokeScript(
                script,
                [
                    {
                        account: inputs.scriptHash,
                        scopes: tx.WitnessScope.CalledByEntry.toString(),
                    },
                ]
            );
            if (invokeFunctionResponse.state !== 'HALT') {
                throw new Error(
                    'Transfer script errored out! You might not have sufficient funds for this transfer.'
                );
            }
            const requiredSystemFee: any = u.Fixed8.fromRawNumber(
                invokeFunctionResponse.gasconsumed
            );
            if (inputs.systemFee && inputs.systemFee >= requiredSystemFee) {
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

        /**
         * We will also need to check that the inital address has sufficient funds for the transfer.
         * We look for both funds of the token we intend to transfer and GAS required to pay for the transaction.
         * For this, we rely on the NEP5Tracker plugin. Hopefully, the node we select has the plugin installed.
         */
        async function checkBalance() {
            let balanceResponse;
            try {
                // balanceResponse = await rpcClient.query({
                //     method: 'getnep5balances',
                //     params: [inputs.fromAccountAddress],
                //     id: 1,
                //     jsonrpc: '2.0',
                // });
                balanceResponse = await assetStateTemp
                    .fetchBalance(inputs.fromAccountAddress)
                    .toPromise();
            } catch (e) {
                console.log(
                    '\u001b[31m  ✗ Unable to get balances as plugin was not available. \u001b[0m'
                );
                return;
            }
            // Check for token funds
            const balances = balanceResponse.filter((bal) =>
                bal.asset_id.includes(inputs.tokenScriptHash)
            );
            const sourceBalanceAmount =
                balances.length === 0 ? 0 : balances[0].balance;
            const balanceAmount = bignumber(sourceBalanceAmount)
                .mul(bignumber(10).pow(params.decimals))
                .toNumber();
            if (balanceAmount < inputs.amountToTransfer) {
                throw {
                    msg: `Insufficient funds! Found ${sourceBalanceAmount}`,
                };
            } else {
                console.log('\u001b[32m  ✓ Token funds found \u001b[0m');
            }

            // Check for gas funds for fees
            const gasRequirements = new u.Fixed8(vars.tx.networkFee).plus(
                vars.tx.systemFee
            );
            const gasBalance = balanceResponse.filter((bal) =>
                bal.asset_id.includes(CONST.ASSET_ID.GAS)
            );
            const gasAmount =
                gasBalance.length === 0
                    ? new u.Fixed8(0)
                    : new u.Fixed8(gasBalance[0].balance);
            if (gasAmount.lt(gasRequirements)) {
                throw {
                    msg: `Insufficient gas to pay for fees! Required ${gasRequirements.toString()} but only had ${gasAmount.toString()}`,
                };
            } else {
                console.log(
                    `\u001b[32m  ✓ Sufficient GAS for fees found (${gasRequirements.toString()}) \u001b[0m`
                );
            }

            // 如果转的是 gas
            if (inputs.tokenScriptHash.indexOf(CONST.ASSET_ID.GAS) >= 0) {
                const gasRequirements8 = bignumber(
                    gasRequirements.toNumber()
                ).mul(bignumber(10).pow(params.decimals));
                const totalRequirements = bignumber(inputs.amountToTransfer)
                    .add(gasRequirements8)
                    .toNumber();
                if (balanceAmount < totalRequirements) {
                    throw {
                        msg: `Insufficient funds! Found ${sourceBalanceAmount}`,
                    };
                }
            }
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
                // .then(checkToken)
                .then(checkNetworkFee)
                .then(checkSystemFee)
                .then(checkBalance)
                .then(() => {
                    return vars.tx;
                })
        );
    }

    async sendNeo3Tx(tx1: Transaction): Promise<any> {
        const result = await rpcClient.sendRawTransaction(tx1.serialize(true));

        console.log('\n\n--- Transaction hash ---');
        console.log(result);
        return result;
    }
}
