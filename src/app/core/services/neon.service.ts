import { Injectable } from '@angular/core';
import Neon2, {
    wallet as wallet2,
    tx as tx2,
    rpc as rpc2,
} from '@cityofzion/neon-js';
import Neon3 from '@cityofzion/neon-js-neo3';
import {
    wallet as wallet3,
    tx as tx3,
    rpc as rpc3,
} from '@cityofzion/neon-core-neo3/lib';
import {
    Wallet as Wallet2,
    WalletJSON as WalletJSON2,
} from '@cityofzion/neon-core/lib/wallet';
import {
    Wallet as Wallet3,
    WalletJSON as WalletJSON3,
} from '@cityofzion/neon-core-neo3/lib/wallet';
import { Observable, from, Observer, of, Subject, forkJoin } from 'rxjs';
import { map, catchError, startWith, publish, refCount } from 'rxjs/operators';
import { ChromeService } from './chrome.service';
import { GlobalService } from './global.service';
import { Transaction, TransactionInput } from '@cityofzion/neon-core/lib/tx';
import { UTXO, ClaimItem, GAS } from '@/models/models';
import { Fixed8 } from '@cityofzion/neon-core/lib/u';
import { sc, u } from '@cityofzion/neon-core';
import { EVENT, TxHashAttribute } from '@/models/dapi';
import { bignumber } from 'mathjs';
import { ChainType } from '@popup/_lib';

@Injectable()
export class NeonService {
    currentWalletChainType: ChainType;
    selectedChainType: ChainType;
    net: string;
    // 当前钱包的链
    private _neon: any = Neon2;
    private _neonWallet: any = wallet2;
    private _neonTx: any = tx2;
    private _neonRpc: any = rpc2;
    // 创建导入钱包的链
    private _selectedNeon: any = Neon2;
    private _selectedNeonWallet: any = wallet2;
    // 当前钱包所在链的钱包数组
    private _walletArr: Array<Wallet2 | Wallet3> = [];
    private _WIFArr: string[] = [];
    // neo2
    private _walletArr2: Array<Wallet2 | Wallet3> = [];
    private _WIFArr2: string[] = [];
    // neo3
    private _walletArr3: Array<Wallet2 | Wallet3> = [];
    private _WIFArr3: string[] = [];

    private _wallet: Wallet2 | Wallet3;
    private $wallet: Subject<Wallet2 | Wallet3> = new Subject();

    /**
     * Currently opened wallet, return null if unexists.
     * 获取当前打开的钱包 不存在则返回null
     */
    public get wallet(): Wallet2 | Wallet3 {
        return this._wallet || null;
    }

    public get walletArr(): Array<Wallet2 | Wallet3> {
        return this._walletArr || null;
    }

    public get WIFArr(): string[] {
        return this._WIFArr || null;
    }

    public get neo2WalletArr(): Array<Wallet2 | Wallet3> {
        return this._walletArr2 || null;
    }

    public get neo3WalletArr(): Array<Wallet2 | Wallet3> {
        return this._walletArr3 || null;
    }

    public reset() {
        this._wallet = null;
        this._walletArr = [];
        this._walletArr2 = [];
        this._walletArr3 = [];
        this._WIFArr = [];
        this._WIFArr2 = [];
        this._WIFArr3 = [];
    }

    public pushWalletArray(w: WalletJSON2 | WalletJSON3) {
        this.changeChainType(this.selectedChainType);
        this._walletArr.push(this.parseWallet(w));
    }
    public pushWIFArray(WIF: string) {
        this.changeChainType(this.selectedChainType);
        this._WIFArr.push(WIF);
    }

    public getWalletArrayJSON(
        walletArr: Array<Wallet2 | Wallet3> = null
    ): Array<WalletJSON2 | WalletJSON3> {
        const res = [];
        if (walletArr === null) {
            this._walletArr.forEach((item) => {
                res.push(item.export());
            });
        } else {
            walletArr.forEach((item) => {
                res.push(item.export());
            });
        }
        return res;
    }

    /**
     * 判断钱包地址是否存在
     * @param w 钱包地址
     */
    public verifyWallet(w: Wallet2 | Wallet3): boolean {
        if (this._walletArr === []) {
            return true;
        } else {
            if (
                this._walletArr.findIndex(
                    (item) => item.accounts[0].address === w.accounts[0].address
                ) >= 0
            ) {
                return false;
            } else {
                return true;
            }
        }
    }

    /**
     * Address of currently opened wallet, return null if unexists.
     * 当前打开的钱包中的地址 不存在则返回null
     */
    public get address(): string {
        return (
            this._wallet &&
            this._wallet.accounts[0] &&
            this._wallet.accounts[0].address
        );
    }
    constructor(
        private chrome: ChromeService,
        private global: GlobalService
    ) {
        this.chrome.getNet().subscribe(net => {
            this.net = net;
        });
    }

    public clearCache() {
        this._wallet =
            this.currentWalletChainType === 'Neo2'
                ? new Wallet2()
                : new Wallet3();
        this._walletArr = [];
        this._walletArr2 = [];
        this._walletArr3 = [];
        this.$wallet = new Subject();
    }

    public walletIsOpen(): Observable<boolean> {
        const getWallet = this.chrome.getWallet();
        const getNeo2WIFArr = this.chrome.getWIFArray('Neo2');
        const getNeo3WIFArr = this.chrome.getWIFArray('Neo3');
        const getNeo2WalletArr = this.chrome.getWalletArray('Neo2');
        const getNeo3WalletArr = this.chrome.getWalletArray('Neo3');
        const Neo3AddressFlag = this.chrome.getUpdateNeo3AddressFlag();
        return forkJoin([
            getWallet,
            getNeo2WIFArr,
            getNeo3WIFArr,
            getNeo2WalletArr,
            getNeo3WalletArr,
            Neo3AddressFlag,
        ]).pipe(
            map((res) => {
                if (!res[5] && res[2] && res[2].length > 0 && res[4] && res[4].length > 0) {
                    res[4].forEach((item, index) => {
                        const account = new wallet3.Account(wallet3.getPrivateKeyFromWIF(res[2][index]));
                        item.accounts[0].address = account.label;
                        item.accounts[0].label = account.label;
                        if (item.accounts[0].key === res[0].accounts[0].key) {
                            res[0].accounts[0].address = item.accounts[0].address;
                            res[0].accounts[0].label = item.accounts[0].label;
                            this.chrome.setWallet(res[0]);
                        }
                    });
                    this.chrome.setWalletArray(res[4], 'Neo3');
                    this.chrome.setUpdateNeo3AddressFlag(true);
                }
                // wallet
                this._wallet = this.parseWallet(res[0]);
                this.$wallet.next(this._wallet);
                // neo2 WIFArr
                if (res[1] && res[1].length > 0) {
                    this._WIFArr2 = res[1];
                }
                // neo3 WIFArr
                if (res[2] && res[2].length > 0) {
                    this._WIFArr3 = res[2];
                }
                const flag = { Neo2: false, Neo3: false };
                // neo2 walletArr
                if (res[3] && res[3].length > 0) {
                    const tempArray = [];
                    res[3].forEach((item) => {
                        tempArray.push(this.parseWallet(item));
                    });
                    this._walletArr2 = tempArray;
                    flag.Neo2 = true;
                }
                // neo3 walletArr
                if (res[4] && res[4].length > 0) {
                    const tempArray = [];
                    res[4].forEach((item) => {
                        tempArray.push(this.parseWallet(item));
                    });
                    this._walletArr3 = tempArray;
                    flag.Neo3 = true;
                }
                if (this.address) {
                    this.changeChainType(
                        wallet3.isAddress(this.address) ? 'Neo3' : 'Neo2'
                    );
                } else {
                    this.changeChainType(this.selectedChainType);
                }
                if (flag[this.currentWalletChainType]) {
                    return true;
                } else {
                    return false;
                }
            }),
            catchError((e) => {
                this.global.log('检查钱包打开出错', e);
                return of(false);
            })
        );
    }
    /**
     * Create a new wallet include one NEP6 account.
     * 创建包含单个NEP6的新钱包
     * @param key encrypt password for new address
     */
    public createWallet(key: string, name: string = null): Observable<any> {
        this.selectChainType();
        if (this.selectedChainType === 'Neo2') {
            const privateKey = this._selectedNeonWallet.generatePrivateKey();
            const account = new this._selectedNeonWallet.Account(privateKey);
            const w = this._selectedNeon.create.wallet({
                name: name || 'NeoLineUser',
            } as any);
            w.addAccount(account);
            const wif = w.accounts[0].WIF;
            return from(w.accounts[0].encrypt(key)).pipe(
                map(() => {
                    (w.accounts[0] as any).wif = wif;
                    return w;
                })
            );
        } else if (this.selectedChainType === 'Neo3') {
            const account = new this._selectedNeonWallet.Account();
            const wif = account.WIF;
            const w = new this._selectedNeonWallet.Wallet({
                name: name || 'NeoLineUser',
            } as any);
            w.addAccount(account);
            return from(w.accounts[0].encrypt(key)).pipe(
                map(() => {
                    (w.accounts[0] as any).wif = wif;
                    return w;
                })
            );
        }
    }

    /**
     * 修改钱包的账户名
     * @param name name of wallet
     */
    public updateWalletName(
        name: string,
        w: Wallet2 | Wallet3
    ): Observable<Wallet2 | Wallet3> {
        if (w === this._wallet || w === null) {
            this._wallet.name = name;
            this.$wallet.next(this._wallet);
            return of(this._wallet);
        } else {
            w.name = name;
            return of(w);
        }
    }

    public delWallet(w: Wallet2 | Wallet3): Observable<boolean> {
        this.changeChainType(this.currentWalletChainType);
        const index = this._walletArr.findIndex(
            (item) => item.accounts[0].address === w.accounts[0].address
        );
        if (
            w.accounts[0].address === this._wallet.accounts[0].address ||
            w === null
        ) {
            if (this.walletArr.length === 1) {
                this._walletArr.splice(index, 1);
                if (this._WIFArr.length > index) {
                    this._WIFArr.splice(index, 1);
                }
                this.chrome.setWalletArray(
                    this.getWalletArrayJSON(),
                    this.currentWalletChainType
                );
                this.chrome.setWIFArray(
                    this._WIFArr,
                    this.currentWalletChainType
                );
                const otherChainWalletArr =
                    this.currentWalletChainType === 'Neo2'
                        ? this._walletArr3
                        : this._walletArr2;
                if (otherChainWalletArr.length <= 0) {
                    // 另一条链也没有钱包
                    this.chrome.closeWallet();
                    this.chrome.windowCallback({
                        data: {
                            address: this.wallet.accounts[0].address || '',
                            label: this.wallet.name || '',
                        },
                        return: EVENT.DISCONNECTED,
                    });
                } else {
                    // 另一条链还有钱包，切换到另一条链
                    this._wallet = otherChainWalletArr[0];
                    this.changeChainType(
                        wallet3.isAddress(this.address) ? 'Neo3' : 'Neo2'
                    );
                    this.chrome.setWallet(this._wallet.export());
                }
            } else {
                this._walletArr.splice(index, 1);
                if (this._WIFArr.length > index) {
                    this._WIFArr.splice(index, 1);
                }
                this._wallet = this._walletArr[0];
                this.changeChainType(
                    wallet3.isAddress(this.address) ? 'Neo3' : 'Neo2'
                );
                this.chrome.setWallet(this._wallet.export());
                this.chrome.setWalletArray(
                    this.getWalletArrayJSON(),
                    this.currentWalletChainType
                );
                this.chrome.setWIFArray(
                    this._WIFArr,
                    this.currentWalletChainType
                );
            }
            return of(true);
        } else {
            if (this._WIFArr.length > index) {
                this._WIFArr.splice(index, 1);
            }
            this._walletArr.splice(index, 1);
            this.chrome.setWalletArray(
                this.getWalletArrayJSON(),
                this.currentWalletChainType
            );
            this.chrome.setWIFArray(this._WIFArr, this.currentWalletChainType);
            return of(false);
        }
    }

    /**
     * Create a new wallet include given private key and encrypt by given password.
     * 创建包含指定私钥的新钱包，并进行加密
     * @param privKey private key to import
     * @param key encrypt password for new address
     */
    public importPrivateKey(
        privKey: string,
        key: string,
        name: string = null
    ): Observable<Wallet2 | Wallet3> {
        this.selectChainType();
        if (this.selectedChainType === 'Neo2') {
            const account = new this._selectedNeonWallet.Account(privKey);
            const w = this._selectedNeon.create.wallet({
                name: name || 'NeoLineUser',
            } as any);
            w.addAccount(account);
            const wif = w.accounts[0].WIF;
            w.encrypt(0, key);
            return from(w.accounts[0].encrypt(key)).pipe(
                map(() => {
                    (w.accounts[0] as any).wif = wif;
                    return w;
                })
            );
        } else if (this.selectedChainType === 'Neo3') {
            const account = new this._selectedNeonWallet.Account(privKey);
            const w = new this._selectedNeonWallet.Wallet({
                name: name || 'NeoLineUser',
            } as any);
            w.addAccount(account);
            const wif = w.accounts[0].WIF;
            w.encrypt(0, key);
            return from(w.accounts[0].encrypt(key)).pipe(
                map(() => {
                    (w.accounts[0] as any).wif = wif;
                    return w;
                })
            );
        }
    }
    /**
     * Create a new wallet include given private key and encrypt by given password.
     * 创建包含指定私钥的新钱包，并进行加密
     * @param privKey private key to import
     * @param key encrypt password for new address
     */
    public importWIF(
        wif: string,
        key: string,
        name: string = null
    ): Observable<Wallet2 | Wallet3> {
        this.selectChainType();
        if (this.selectedChainType === 'Neo2') {
            const account = new this._selectedNeonWallet.Account(
                this._selectedNeonWallet.getPrivateKeyFromWIF(wif)
            );
            const w = this._selectedNeon.create.wallet({
                name: name || 'NeoLineUser',
            } as any);
            w.addAccount(account);
            w.encrypt(0, key);
            return from(w.accounts[0].encrypt(key)).pipe(
                map(() => {
                    (w.accounts[0] as any).wif = wif;
                    return w;
                })
            );
        } else if (this.selectedChainType === 'Neo3') {
            const account = new this._selectedNeonWallet.Account(
                this._selectedNeonWallet.getPrivateKeyFromWIF(wif)
            );
            const w = new this._selectedNeonWallet.Wallet({
                name: name || 'NeoLineUser',
            } as any);
            w.addAccount(account);
            w.encrypt(0, key);
            return from(w.accounts[0].encrypt(key)).pipe(
                map(() => {
                    (w.accounts[0] as any).wif = wif;
                    return w;
                })
            );
        }
    }
    /**
     * Create a new wallet include given encrypted key and try decrypt it by given password.
     * 创建包含指定已加密私钥的钱包，并尝试解密以校验密码
     * @param encKey encrypted key to import
     * @param key encrypt password for this encKey
     */
    public importEncryptKey(
        encKey: string,
        key: string,
        name: string
    ): Observable<Wallet2 | Wallet3> {
        this.selectChainType();
        return new Observable((observer: Observer<Wallet2 | Wallet3>) => {
            if (this.selectedChainType === 'Neo2') {
                const w = this._selectedNeon.create.wallet({
                    name: name || 'NeoLineUser',
                } as any);
                w.addAccount(new this._selectedNeonWallet.Account(encKey));
                this._selectedNeonWallet
                    .decrypt(encKey, key)
                    .then((wif) => {
                        const account = new this._selectedNeonWallet.Account(
                            this._selectedNeonWallet.getPrivateKeyFromWIF(wif)
                        );
                        const returnRes = this._selectedNeon.create.wallet({
                            name: name || 'NeoLineUser',
                        } as any);
                        returnRes.addAccount(account);
                        returnRes.encrypt(0, key);
                        returnRes.accounts[0].encrypt(key).then((res) => {
                            (returnRes.accounts[0] as any).wif = wif;
                            observer.next(returnRes);
                        });
                    })
                    .catch((err) => {
                        observer.error('Wrong password');
                    });
            } else if (this.selectedChainType === 'Neo3') {
                const w = new this._selectedNeonWallet.Wallet({
                    name: name || 'NeoLineUser',
                } as any);
                w.addAccount(new this._selectedNeonWallet.Account(encKey));
                this._selectedNeonWallet
                    .decrypt(encKey, key)
                    .then((wif) => {
                        const account = new this._selectedNeonWallet.Account(
                            this._selectedNeonWallet.getPrivateKeyFromWIF(wif)
                        );
                        const returnRes = new this._selectedNeonWallet.Wallet({
                            name: name || 'NeoLineUser',
                        } as any);
                        returnRes.addAccount(account);
                        returnRes.encrypt(0, key);
                        returnRes.accounts[0].encrypt(key).then((res) => {
                            (returnRes.accounts[0] as any).wif = wif;
                            observer.next(returnRes);
                        });
                    })
                    .catch((err) => {
                        observer.error('Wrong password');
                    });
            }
        });
    }
    public parseWallet(src: any): Wallet2 | Wallet3 {
        try {
            let isNeo3 = false;
            if (wallet3.isAddress(src.accounts[0].address)) {
                isNeo3 = true;
            }
            const w = isNeo3 ? new Wallet3(src) : new Wallet2(src);
            if (!w.accounts.length) {
                return null;
            }
            return w;
        } catch (e) {
            return null;
        }
    }

    public createTx(
        fromAddress: string,
        to: string,
        balances: UTXO[],
        amount: string,
        fee: number = 0
    ): Transaction {
        this.changeChainType();
        const fromScript = this._neonWallet.getScriptHashFromAddress(
            fromAddress
        );
        const toScript = this._neonWallet.getScriptHashFromAddress(to);
        if (fromScript.length !== 40 || toScript.length !== 40) {
            throw new Error('target address error');
        }
        if (balances.length === 0) {
            throw new Error('no balance');
        }
        let assetId = balances[0].asset_id;
        if (assetId.startsWith('0x') && assetId.length === 66) {
            assetId = assetId.substring(2);
        }
        const newTx = new this._neonTx.ContractTransaction();

        newTx.addOutput({
            assetId,
            value: new Fixed8(amount),
            scriptHash: toScript,
        });
        let curr = bignumber('0');
        for (const item of balances) {
            curr = curr.add(bignumber(item.value) || 0);
            newTx.inputs.push(
                new TransactionInput({
                    prevIndex: item.n,
                    prevHash:
                        item.txid.startsWith('0x') && item.txid.length === 66
                            ? item.txid.substring(2)
                            : item.txid,
                })
            );
            if (curr.comparedTo(bignumber(amount).add(bignumber(fee))) === 1) {
                break;
            }
        }
        const payback =
            assetId === GAS || assetId === GAS.substring(2)
                ? curr.sub(amount).sub(fee)
                : curr.sub(amount);
        if (payback < bignumber('0')) {
            throw new Error('no enough balance to pay');
        }
        if (payback > bignumber('0')) {
            newTx.addOutput({
                assetId,
                value: payback.toNumber(),
                scriptHash: fromScript,
            });
        }
        const remark = 'From NeoLine';
        newTx.addAttribute(
            this._neonTx.TxAttrUsage.Remark1,
            u.str2hexstring(remark)
        );
        return newTx;
    }
    public createTxForNEP5(
        fraomAddress: string,
        to: string,
        scriptHash: string,
        amount: string,
        decimals: number,
        broadcastOverride: boolean = false
    ): Transaction {
        this.changeChainType();
        const fromScript = this._neonWallet.getScriptHashFromAddress(
            fraomAddress
        );
        const toScript = this._neonWallet.getScriptHashFromAddress(to);
        if (fromScript.length !== 40 || toScript.length !== 40) {
            throw new Error('target address error');
        }
        const newTx = new this._neonTx.InvocationTransaction();
        const amountBigNumber = bignumber(amount).mul(
            bignumber(10).pow(decimals)
        );
        newTx.script = sc.createScript({
            scriptHash:
                scriptHash.startsWith('0x') && scriptHash.length === 42
                    ? scriptHash.substring(2)
                    : scriptHash,
            operation: 'transfer',
            args: [
                u.reverseHex(fromScript),
                u.reverseHex(toScript),
                this._neon.create.contractParam(
                    'Integer',
                    amountBigNumber.toFixed()
                ),
            ],
        });
        newTx.addAttribute(
            this._neonTx.TxAttrUsage.Script,
            u.reverseHex(fromScript)
        );
        const remark = broadcastOverride
            ? 'From NeoLine'
            : `From NeoLine at ${new Date().getTime()}`;
        newTx.addAttribute(
            this._neonTx.TxAttrUsage.Remark1,
            u.str2hexstring(remark)
        );
        return newTx;
    }

    public getVerificationSignatureForSmartContract(
        ScriptHash: string
    ): Promise<any> {
        this.changeChainType();
        return this._neonRpc.Query.getContractState(ScriptHash)
            .execute(this.global.RPCDomain)
            .then(({ result }) => {
                const { parameters } = result;
                return new this._neonTx.Witness({
                    invocationScript: '00'.repeat(parameters.length),
                    verificationScript: '',
                });
            });
    }

    public claimGAS(claims: Array<ClaimItem>): Observable<Array<Transaction>> {
        this.changeChainType();
        return new Observable((observer) => {
            const claimArr = [[]];
            const valueArr = [];
            let count = 0;
            let txCount = 0;
            let itemValue = 0;
            claims.forEach((item) => {
                count++;
                claimArr[txCount].push({
                    prevHash:
                        item.txid.length === 66
                            ? item.txid.slice(2)
                            : item.txid,
                    prevIndex: item.n,
                });
                itemValue = this.global.mathAdd(
                    itemValue,
                    Number(item.unclaimed)
                );
                if (count >= 20) {
                    txCount++;
                    count = 0;
                    claimArr[txCount] = [];
                    valueArr.push(itemValue);
                    itemValue = 0;
                }
            });
            if (itemValue !== 0) {
                valueArr.push(itemValue);
            }
            const wif = this.WIFArr[
                this._walletArr.findIndex(
                    (item) =>
                        item.accounts[0].address ===
                        this._wallet.accounts[0].address
                )
            ];
            const txArr = [];
            claimArr.forEach((item, index) => {
                const newTx = new this._neonTx.ClaimTransaction({
                    claims: item,
                });
                newTx.addIntent('GAS', valueArr[index], this.address);
                newTx.sign(wif);
                txArr.push(newTx);
            });
            observer.next(txArr);
            observer.complete();
        });
    }
    public isAsset(assetId: string): boolean {
        return assetId.startsWith('0x')
            ? assetId.length === 66
            : assetId.length === 64;
    }

    /**
     * 修改钱包名称时，web 头部名称跟着修改
     */
    public walletSub(): Observable<Wallet2 | Wallet3> {
        return this._wallet
            ? this.$wallet.pipe(startWith(this._wallet), publish(), refCount())
            : this.$wallet.pipe(publish(), refCount());
    }

    private zeroPad(
        input: string | any[] | sc.OpCode,
        length: number,
        padEnd?: boolean
    ) {
        const zero = '0';
        input = String(input);

        if (padEnd) {
            return input + zero.repeat(length - input.length);
        }

        return zero.repeat(length - input.length) + input;
    }

    public parseTxHashAttr({
        type,
        value,
        txAttrUsage,
    }: TxHashAttribute): TxHashAttribute {
        this.changeChainType();
        let parsedValue = this.zeroPad(value, 64, true);
        switch (type) {
            case 'Boolean':
                parsedValue = this.zeroPad(
                    !!value ? sc.OpCode.PUSHT : sc.OpCode.PUSHF,
                    64,
                    true
                );
                break;
            case 'Address':
                parsedValue = this.zeroPad(
                    u.reverseHex(
                        this._neonWallet.getScriptHashFromAddress(value)
                    ),
                    64,
                    true
                );
                break;
            case 'Integer':
                const h = Number(value).toString(16);
                parsedValue = this.zeroPad(
                    u.reverseHex(h.length % 2 ? '0' + h : h),
                    64,
                    true
                );
                break;
            case 'String':
                parsedValue = this.zeroPad(
                    u.ab2hexstring(u.str2ab(value)),
                    64,
                    true
                );
                break;
        }

        return {
            type,
            value: parsedValue,
            txAttrUsage,
        };
    }

    //#region neo3
    changeChainType(chain: ChainType = this.currentWalletChainType) {
        this.currentWalletChainType = chain;
        switch (chain) {
            case 'Neo2':
                this._neon = Neon2;
                this._neonWallet = wallet2;
                this._neonTx = tx2;
                this._neonRpc = rpc2;
                this._WIFArr = this._WIFArr2;
                this._walletArr = this._walletArr2;
                break;
            case 'Neo3':
                this._neon = Neon3;
                this._neonWallet = wallet3;
                this._neonTx = tx3;
                this._neonRpc = rpc3;
                this._WIFArr = this._WIFArr3;
                this._walletArr = this._walletArr3;
                break;
        }
    }

    selectChainType(chain: ChainType = this.selectedChainType) {
        this.selectedChainType = chain;
        switch (chain) {
            case 'Neo2':
                this._selectedNeon = Neon2;
                this._selectedNeonWallet = wallet2;
                break;
            case 'Neo3':
                this._selectedNeon = Neon3;
                this._selectedNeonWallet = wallet3;
                break;
        }
    }
    //#endregion
}
