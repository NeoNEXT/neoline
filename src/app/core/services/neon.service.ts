import { Injectable } from '@angular/core';
import Neon2, {
    wallet as wallet2,
    tx as tx2,
    rpc as rpc2,
} from '@cityofzion/neon-js';
import Neon3, {
    wallet as wallet3,
    tx as tx3,
    rpc as rpc3,
} from '@cityofzion/neon-js-neo3';
import { Wallet, WalletJSON } from '@cityofzion/neon-core/lib/wallet';
import { Observable, from, Observer, of, Subject } from 'rxjs';
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

class InitChainWalletArr {
    Neo2: Wallet[] = [];
    Neo3: Wallet[] = [];
}

class InitChainWIFtArr {
    Neo2: string[] = [];
    Neo3: string[] = [];
}

@Injectable()
export class NeonService {
    chainType: ChainType = 'Neo2';

    private _neon: any = Neon2;
    private _neonWallet: any = wallet2;
    private _neonTx: any = tx2;
    private _neonRpc: any = rpc2;

    private _walletArr = new InitChainWalletArr();
    private _WIFArr = new InitChainWIFtArr();
    private _wallet: Wallet;
    private $wallet: Subject<Wallet> = new Subject();

    /**
     * Currently opened wallet, return null if unexists.
     * 获取当前打开的钱包 不存在则返回null
     */
    public get wallet(): Wallet {
        return this._wallet || null;
    }

    public get walletArr(): Array<Wallet> {
        return this._walletArr[this.chainType] || null;
    }

    public get WIFArr(): Array<string> {
        return this._WIFArr[this.chainType] || [];
    }

    public reset() {
        this._wallet = null;
        this._walletArr = new InitChainWalletArr();
        this._WIFArr = new InitChainWIFtArr();
    }

    public pushWalletArray(w: WalletJSON) {
        this._walletArr[this.chainType].push(this.parseWallet(w));
    }
    public pushWIFArray(WIF: string) {
        this._WIFArr[this.chainType].push(WIF);
    }

    public getWalletArrayJSON(
        walletArr: Array<Wallet> = null
    ): Array<WalletJSON> {
        const res = [];
        if (walletArr === null) {
            this._walletArr[this.chainType].forEach((item) => {
                res.push(item.export());
            });
        } else {
            walletArr.forEach((item) => {
                res.push(item.export());
            });
        }
        return res;
    }

    public verifyWallet(w: Wallet): boolean {
        if (this._walletArr[this.chainType] === []) {
            return true;
        } else {
            if (
                this._walletArr[this.chainType].findIndex(
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
    constructor(private chrome: ChromeService, private global: GlobalService) {}

    public clearCache() {
        this._wallet = new Wallet();
        this._walletArr = new InitChainWalletArr();
        this.$wallet = new Subject();
    }

    public walletIsOpen(): Observable<boolean> {
        this.chrome.getWallet().subscribe((res) => {
            this._wallet = this.parseWallet(res);
            this.selectChainType(
                wallet3.isAddress(this.address) ? 'Neo3' : 'Neo2'
            );
            this.$wallet.next(this._wallet);
        });
        this.chrome.getWIFArray(this.chainType).subscribe((res) => {
            if (res !== undefined && res !== null && res.length > 0) {
                this._WIFArr[this.chainType] = res;
            }
        });
        return this.chrome.getWalletArray(this.chainType).pipe(
            map((res) => {
                if (res.length > 0) {
                    const tempArray = [];
                    res.forEach((item) => {
                        tempArray.push(this.parseWallet(item));
                    });
                    this._walletArr[this.chainType] = tempArray;
                    this.global.log(
                        '已打开钱包',
                        this._walletArr[this.chainType]
                    );
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
        const privateKey = this.generatePrivateKey();
        const account = new this._neonWallet.Account(privateKey);
        const w = this._neon.create.wallet({
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
    }

    /**
     * 修改钱包的账户名
     * @param name name of wallet
     */
    public updateWalletName(name: string, w: Wallet): Observable<Wallet> {
        if (w === this._wallet || w === null) {
            this._wallet.name = name;
            this.$wallet.next(this._wallet);
            return of(this._wallet);
        } else {
            w.name = name;
            return of(w);
        }
    }

    public delWallet(w: Wallet): Observable<boolean> {
        const index = this._walletArr[this.chainType].findIndex(
            (item) => item.accounts[0].address === w.accounts[0].address
        );
        if (
            w.accounts[0].address === this._wallet.accounts[0].address ||
            w === null
        ) {
            if (this.walletArr.length === 1) {
                this.chrome.closeWallet();
                this._walletArr[this.chainType].splice(index, 1);
                if (this._WIFArr[this.chainType].length > index) {
                    this._WIFArr[this.chainType].splice(index, 1);
                }
                this.chrome.setWalletArray(
                    this.getWalletArrayJSON(),
                    this.chainType
                );
                this.chrome.setWIFArray(
                    this._WIFArr[this.chainType],
                    this.chainType
                );
                this.chrome.windowCallback({
                    data: {
                        address: this.wallet.accounts[0].address || '',
                        label: this.wallet.name || '',
                    },
                    return: EVENT.DISCONNECTED,
                });
            } else {
                this._walletArr[this.chainType].splice(index, 1);
                if (this._WIFArr[this.chainType].length > index) {
                    this._WIFArr[this.chainType].splice(index, 1);
                }
                this._wallet = this._walletArr[this.chainType][0];
                this.selectChainType(
                    wallet3.isAddress(this.address) ? 'Neo3' : 'Neo2'
                );
                this.chrome.setWallet(this._wallet.export());
                this.chrome.setWalletArray(
                    this.getWalletArrayJSON(),
                    this.chainType
                );
                this.chrome.setWIFArray(
                    this._WIFArr[this.chainType],
                    this.chainType
                );
            }
            return of(true);
        } else {
            if (this._WIFArr[this.chainType].length > index) {
                this._WIFArr[this.chainType].splice(index, 1);
            }
            this._walletArr[this.chainType].splice(index, 1);
            this.chrome.setWalletArray(
                this.getWalletArrayJSON(),
                this.chainType
            );
            this.chrome.setWIFArray(
                this._WIFArr[this.chainType],
                this.chainType
            );
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
    ): Observable<Wallet> {
        const account = new this._neonWallet.Account(privKey);
        const w = this._neon.create.wallet({
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
    ): Observable<Wallet> {
        const account = new this._neonWallet.Account(
            this._neonWallet.getPrivateKeyFromWIF(wif)
        );
        const w = this._neon.create.wallet({
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
    ): Observable<Wallet> {
        return new Observable((observer: Observer<Wallet>) => {
            const w = this._neon.create.wallet({
                name: name || 'NeoLineUser',
            } as any);
            w.addAccount(new this._neonWallet.Account(encKey));
            this._neonWallet
                .decrypt(encKey, key)
                .then((wif) => {
                    const account = new this._neonWallet.Account(
                        this._neonWallet.getPrivateKeyFromWIF(wif)
                    );
                    const returnRes = this._neon.create.wallet({
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
                    observer.error('import failed');
                });
        });
    }
    public parseWallet(src: any): Wallet {
        if (!this._neonWallet) {
            return null;
        }
        try {
            const w = new Wallet(src);
            if (!w.accounts.length) {
                return null;
            }
            return w;
        } catch (e) {
            return null;
        }
    }
    private generatePrivateKey(): string {
        return this._neonWallet.generatePrivateKey();
    }

    public createTx(
        fromAddress: string,
        to: string,
        balances: UTXO[],
        amount: string,
        fee: number = 0
    ): Transaction {
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
                this._walletArr[this.chainType].findIndex(
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
    public walletSub(): Observable<Wallet> {
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
    selectChainType(chain: ChainType) {
        if (this.chainType === chain) {
            return;
        }
        this.chainType = chain;
        switch (chain) {
            case 'Neo2':
                this._neon = Neon2;
                this._neonWallet = wallet2;
                this._neonTx = tx2;
                this._neonRpc = rpc2;
                break;
            case 'Neo3':
                this._neon = Neon3;
                this._neonWallet = wallet3;
                this._neonTx = tx3;
                this._neonRpc = rpc3;
                break;
        }
    }
    //#endregion
}
