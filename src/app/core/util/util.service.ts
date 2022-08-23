import { Injectable } from '@angular/core';
import { NeonService } from '../services/neon.service';
import { wallet } from '@cityofzion/neon-core-neo3';
import { wallet as walletPr5 } from '@cityofzion/neon-core-neo3-pr5';
import { wallet as walletRc1 } from '@cityofzion/neon-core-neo3-rc1';
import {
    base642hex,
    hex2base64,
    hexstring2str,
} from '@cityofzion/neon-core-neo3/lib/u';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';
import {
    ChainType,
    DEFAULT_NEO2_ASSETS,
    NEO3_CONTRACT,
    GAS3_CONTRACT,
    DEFAULT_NEO3_ASSETS,
    NNS_CONTRACT,
} from '@/app/popup/_lib';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';
import BigNumber from 'bignumber.js';
import { NEO, GAS } from '@/models/models';

@Injectable()
export class UtilServiceState {
    public n2AssetSymbol: Map<string, string> = new Map();
    public n2AssetDecimal: Map<string, number> = new Map();
    public n3AssetSymbol: Map<string, string> = new Map();
    public n3AssetDecimal: Map<string, number> = new Map();
    public n3AssetName: Map<string, string> = new Map();
    public n3NftProperties = {};

    constructor(
        private neon: NeonService,
        private http: HttpService,
        private global: GlobalService
    ) {
        this.n2AssetDecimal.set(NEO, DEFAULT_NEO2_ASSETS.NEO.decimals);
        this.n2AssetSymbol.set(NEO, DEFAULT_NEO2_ASSETS.NEO.symbol);
        this.n2AssetDecimal.set(GAS, DEFAULT_NEO2_ASSETS.GAS.decimals);
        this.n2AssetSymbol.set(GAS, DEFAULT_NEO2_ASSETS.GAS.symbol);
        this.n3AssetDecimal.set(
            NEO3_CONTRACT,
            DEFAULT_NEO3_ASSETS.NEO.decimals
        );
        this.n3AssetSymbol.set(NEO3_CONTRACT, DEFAULT_NEO3_ASSETS.NEO.symbol);
        this.n3AssetDecimal.set(
            GAS3_CONTRACT,
            DEFAULT_NEO3_ASSETS.GAS.decimals
        );
        this.n3AssetSymbol.set(GAS3_CONTRACT, DEFAULT_NEO3_ASSETS.GAS.symbol);
    }

    parseUrl(url: string): any {
        const query = url.slice(url.indexOf('?') + 1);
        const pairs = query.split('&');
        const target = {};
        pairs.forEach((p) => {
            const temp = p.split('=');
            target[temp[0]] = decodeURIComponent(temp[1]);
        });
        return target;
    }

    getNeo3Account(sourceAccount?) {
        const account = sourceAccount ?? this.neon.wallet.accounts[0];
        const accountJson = account.export();
        const index = this.neon.neo3WalletArr.findIndex(
            (item) => item.accounts[0].address === account.address
        );
        const wif = this.neon.neo3WIFArr[index];
        const preview5Account = new walletPr5.Account(
            walletPr5.getPrivateKeyFromWIF(wif)
        );
        const rc1Account = new walletRc1.Account(
            walletRc1.getPrivateKeyFromWIF(wif)
        );
        const latestAccount = new wallet.Account(
            wallet.getPrivateKeyFromWIF(wif)
        );
        // console.log('account: ');
        // console.log(account);
        // console.log('preview5Account: ');
        // console.log(preview5Account);
        // console.log('rc1Account: ');
        // console.log(rc1Account);
        // console.log('latestAccount: ');
        // console.log(latestAccount);

        // console.log(account.contract.script);
        // console.log(preview5Account.contract.script); // hex
        // console.log(base642hex(rc1Account.contract.script)); // base64
        // console.log(base642hex(latestAccount.contract.script)); // base64

        if (accountJson.address === latestAccount.address) {
            if (
                account.contract.script ===
                    hex2base64(preview5Account.contract.script) ||
                account.contract.script === preview5Account.contract.script
            ) {
                accountJson.address = preview5Account.address;
                accountJson.label = preview5Account.label;
                const temp = new walletPr5.Account(accountJson);
                return temp;
            }
            if (
                account.contract.script ===
                    base642hex(rc1Account.contract.script) ||
                account.contract.script === rc1Account.contract.script
            ) {
                accountJson.address = rc1Account.address;
                accountJson.label = rc1Account.label;
                const temp = new walletRc1.Account(accountJson);
                return temp;
            }
        }
        return account;
    }

    n3InvokeScript(script, signers) {
        const data = {
            jsonrpc: '2.0',
            id: 1234,
            method: 'invokescript',
            params: [script, signers],
        };
        return this.http
            .n3RpcPost(this.global.n3Network.rpcUrl, data)
            .toPromise();
    }

    getAssetSymbols(
        contracts: string[],
        chainType: ChainType
    ): Promise<string[]> {
        const rpcUrl =
            chainType === 'Neo2'
                ? this.global.n2Network.rpcUrl
                : this.global.n3Network.rpcUrl;
        const requests = [];
        contracts.forEach((assetId) => {
            let tempReq;
            if (chainType === 'Neo2' && this.n2AssetSymbol.has(assetId)) {
                tempReq = of(this.n2AssetSymbol.get(assetId)).toPromise();
            } else if (
                chainType === 'Neo3' &&
                this.n3AssetSymbol.has(assetId)
            ) {
                tempReq = of(this.n3AssetSymbol.get(assetId)).toPromise();
            } else {
                const data = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'invokefunction',
                    params: [assetId, 'symbol'],
                };
                tempReq = this.http.rpcPost(rpcUrl, data).toPromise();
            }
            requests.push(tempReq);
        });
        return Promise.all([...requests]).then((res) => {
            const symbolsRes = [];
            res.forEach((item, index) => {
                let symbol: string;
                if (typeof item === 'string') {
                    symbol = item;
                }
                if (item.stack) {
                    symbol = item.stack[0].value;
                    if (item.stack[0].type === 'ByteArray') {
                        symbol = hexstring2str(item.stack[0].value);
                    }
                    if (item.stack[0].type === 'ByteString') {
                        symbol = hexstring2str(base642hex(item.stack[0].value));
                    }
                    if (chainType === 'Neo2') {
                        this.n2AssetSymbol.set(contracts[index], symbol);
                    } else {
                        this.n3AssetSymbol.set(contracts[index], symbol);
                    }
                }
                symbolsRes.push(symbol);
            });
            return symbolsRes;
        });
    }

    getAssetDecimals(
        contracts: string[],
        chainType: ChainType
    ): Promise<number[]> {
        const rpcUrl =
            chainType === 'Neo2'
                ? this.global.n2Network.rpcUrl
                : this.global.n3Network.rpcUrl;
        const requests = [];
        contracts.forEach((assetId) => {
            let tempReq;
            if (chainType === 'Neo2' && this.n2AssetDecimal.has(assetId)) {
                tempReq = of(this.n2AssetDecimal.get(assetId)).toPromise();
            } else if (
                chainType === 'Neo3' &&
                this.n3AssetDecimal.has(assetId)
            ) {
                tempReq = of(this.n3AssetDecimal.get(assetId)).toPromise();
            } else {
                const data = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'invokefunction',
                    params: [assetId, 'decimals'],
                };
                tempReq = this.http.rpcPost(rpcUrl, data).toPromise();
            }
            requests.push(tempReq);
        });
        return Promise.all([...requests]).then((res) => {
            const decoimalsRes = [];
            res.forEach((item, index) => {
                let decimal: number;
                if (typeof item === 'number') {
                    decimal = item;
                }
                if (item.stack) {
                    decimal = item.stack[0].value;
                    if (item.stack[0].type === 'Integer') {
                        decimal = Number(item.stack[0].value || 0);
                    }
                    if (item.stack[0].type === 'ByteArray') {
                        decimal = new BigNumber(
                            item.stack[0].value || 0,
                            16
                        ).toNumber();
                    }
                    if (chainType === 'Neo2') {
                        this.n2AssetDecimal.set(contracts[index], decimal);
                    } else {
                        this.n3AssetDecimal.set(contracts[index], decimal);
                    }
                }
                decoimalsRes.push(decimal);
            });
            return decoimalsRes;
        });
    }

    getN3NftNames(contracts: string[]): Promise<string[]> {
        const requests = [];
        contracts.forEach((assetId) => {
            let tempReq;
            if (this.n3AssetName.has(assetId)) {
                tempReq = of(this.n3AssetName.get(assetId)).toPromise();
            } else {
                const data = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getcontractstate',
                    params: [assetId],
                };
                tempReq = this.http
                    .rpcPost(this.global.n3Network.rpcUrl, data)
                    .toPromise();
            }
            requests.push(tempReq);
        });
        return Promise.all([...requests]).then((res) => {
            const namesRes = [];
            res.forEach((item, index) => {
                let name: string;
                if (typeof item === 'string') {
                    name = item;
                }
                if (item?.manifest?.name) {
                    name = item.manifest.name;
                    this.n3AssetName.set(contracts[index], name);
                }
                namesRes.push(name);
            });
            return namesRes;
        });
    }

    getN3NftProperties(contract: string, tokenids: string[]): Promise<any[]> {
        if (!this.n3NftProperties[contract]) {
            this.n3NftProperties[contract] = {};
        }
        const requests = [];
        tokenids.forEach((id) => {
            let tempReq;
            if (this.n3NftProperties[contract][id]) {
                tempReq = of(this.n3NftProperties[contract][id]).toPromise();
            } else {
                const data = {
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getnep11properties',
                    params: [contract, id],
                };
                tempReq = this.http
                    .rpcPost(this.global.n3Network.rpcUrl, data)
                    .toPromise()
                    .catch((err) => err);
            }
            requests.push(tempReq);
        });
        return Promise.all([...requests]).then((res) => {
            const propertiesRes = [];
            res.forEach((item, index) => {
                let properties = { name: '', image: '' };
                if (item?.owner) {
                    properties.name = item.name;
                    properties.image = item.image;
                } else if (item.name) {
                    properties = item;
                }
                this.n3NftProperties[contract][tokenids[index]] = properties;
                propertiesRes.push(properties);
            });
            return propertiesRes;
        });
    }

    getN3NnsAddress(domain: string, chainId: number) {
        const data = {
            jsonrpc: '2.0',
            id: 1,
            method: 'invokefunction',
            params: [
                NNS_CONTRACT[chainId],
                'resolve',
                [
                    {
                        type: 'String',
                        value: domain,
                    },
                    {
                        type: 'Integer',
                        value: '16',
                    },
                ],
            ],
        };
        return this.http.rpcPost(this.global.n3Network.rpcUrl, data).pipe(
            map((res) => {
                let address = '';
                if (res.stack) {
                    address = res.stack[0]?.value;
                    if (res.stack[0]?.type === 'ByteArray') {
                        address = hexstring2str(res.stack[0]?.value);
                    }
                    if (res.stack[0]?.type === 'ByteString') {
                        address = hexstring2str(
                            base642hex(res.stack[0]?.value)
                        );
                    }
                }
                return address;
            })
        );
    }
}
