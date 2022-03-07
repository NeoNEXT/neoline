import { Injectable } from '@angular/core';
import { CONST, rpc, sc, tx, u, wallet } from '@cityofzion/neon-core-neo3/lib';
import { Transaction } from '@cityofzion/neon-core-neo3/lib/tx';
import { Observable, from } from 'rxjs';
import {
    AssetState,
    NotificationService,
    GlobalService,
    NeonService,
} from '@app/core';
import { bignumber } from 'mathjs';
import BigNumber from 'bignumber.js';

interface CreateNeo3TxInput {
    addressFrom: string;
    addressTo: string;
    tokenScriptHash: string;
    amount: any;
    networkFee: number;
    decimals: number;
    nftTokenId?: any;
}

@Injectable()
export class Neo3TransferService {
    rpcClient;
    constructor(
        public assetState: AssetState,
        public notification: NotificationService,
        private globalService: GlobalService,
        private neon: NeonService
    ) {
        this.rpcClient = new rpc.RPCClient(this.globalService.n3Network.rpcUrl);
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
            .toFixed();
        const inputs = {
            scriptHash: tempScriptHash,
            fromAccountAddress: params.addressFrom,
            toAccountAddress: params.addressTo,
            tokenScriptHash: params.tokenScriptHash,
            amountToTransfer: params.amount,
            systemFee: 0,
            networkFee: bignumber(params.networkFee).toFixed() || 0,
        };
        const vars: any = {};
        const NEW_POLICY_CONTRACT =
            '0xcc5e4edd9f5f8dba8bb65734541df7a1c081c67b';
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

            vars.tx.networkFee = u.Fixed8.fromRawNumber(
                networkFeeEstimate.toString()
            ).add(new BigNumber(params.networkFee).toFixed());
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
                    msg: 'Transfer script errored out! You might not have sufficient funds for this transfer.',
                };
            }
            const requiredSystemFee = u.Fixed8.fromRawNumber(
                invokeFunctionResponse.gasconsumed
            );
            if (
                inputs.systemFee &&
                new u.Fixed8(inputs.systemFee) >= requiredSystemFee
            ) {
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
                balanceResponse = await assetStateTemp.getAddressBalances(
                    inputs.fromAccountAddress
                );
            } catch (e) {
                console.log(
                    '\u001b[31m  ✗ Unable to get balances as plugin was not available. \u001b[0m'
                );
                return;
            }
            // Check for gas funds for fees
            const gasRequirements = new u.Fixed8(vars.tx.networkFee).plus(
                vars.tx.systemFee
            );
            const gasBalance = balanceResponse.filter((bal) =>
                bal.asset_id.includes(NEW_GAS)
            );
            const gasAmount =
                gasBalance.length === 0
                    ? new u.Fixed8(0)
                    : new u.Fixed8(gasBalance[0].balance);
            if (gasAmount.lt(gasRequirements)) {
                throw {
                    msg: `${
                        notificationTemp.content.insufficientBalance
                    } ${gasRequirements.toString()} ${
                        notificationTemp.content.butOnlyHad
                    } ${gasAmount.toString()}`,
                };
            } else {
                console.log(
                    `\u001b[32m  ✓ Sufficient GAS for fees found (${gasRequirements.toString()}) \u001b[0m`
                );
            }
            if (!params.nftTokenId) {
                // Check for token funds
                const balances = balanceResponse.filter((bal) =>
                    bal.asset_id.includes(inputs.tokenScriptHash)
                );
                const sourceBalanceAmount =
                    balances.length === 0 ? 0 : balances[0].balance;
                const balanceAmount = bignumber(sourceBalanceAmount).mul(
                    bignumber(10).pow(params.decimals)
                );
                if (
                    balanceAmount.comparedTo(
                        bignumber(inputs.amountToTransfer)
                    ) < 0
                ) {
                    throw {
                        msg: `${notificationTemp.content.insufficientSystemFee} ${sourceBalanceAmount}`,
                    };
                } else {
                    console.log('\u001b[32m  ✓ Token funds found \u001b[0m');
                }

                // 如果转的是 gas
                if (inputs.tokenScriptHash.indexOf(NEW_GAS) >= 0) {
                    const gasRequirements8 = bignumber(
                        gasRequirements.toNumber()
                    ).mul(bignumber(10).pow(params.decimals));
                    const totalRequirements = bignumber(
                        inputs.amountToTransfer
                    ).add(gasRequirements8);
                    if (balanceAmount.comparedTo(totalRequirements) < 0) {
                        throw {
                            msg: `${notificationTemp.content.insufficientSystemFee} ${sourceBalanceAmount}`,
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

    public async getFeeInformation(client) {
        const policyScript = new sc.ScriptBuilder()
            .emitContractCall(sc.PolicyContract.INSTANCE.getFeePerByte())
            .emitContractCall(sc.PolicyContract.INSTANCE.getExecFeeFactor())
            .build();
        const res = await client.invokeScript(
            u.HexString.fromHex(policyScript)
        );
        const [feePerByte, executionFeeFactor] = res.stack.map((s) =>
            u.BigInteger.fromNumber(s.value)
        );
        return { feePerByte, executionFeeFactor };
    }

    async calculateNetworkFee(txn) {
        let txClone = txn.export();
        txClone.systemFee = new BigNumber(txn.systemFee).shiftedBy(8).toFixed(0) as any;
        txClone = new tx.Transaction(txClone);
        const wif =
            this.neon.WIFArr[
                this.neon.walletArr.findIndex(
                    (item) =>
                        item.accounts[0].address ===
                        this.neon.wallet.accounts[0].address
                )
            ];
        txClone.sign(wif, this.globalService.n3Network.magicNumber);
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
