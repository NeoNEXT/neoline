import { Injectable } from '@angular/core';
import Neon, { wallet, tx, rpc } from '@cityofzion/neon-js';
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

@Injectable()
export class NeonService {
    private _wallet: Wallet;
    private _walletArr: Array<Wallet> = [];
    private _WIFArr: Array<string> = [];

    private $wallet: Subject<Wallet> = new Subject();

    /**
     * Currently opened wallet, return null if unexists.
     * 获取当前打开的钱包 不存在则返回null
     */
    public get wallet(): Wallet {
        return this._wallet || null;
    }

    public get walletArr(): Array<Wallet> {
        return this._walletArr || null;
    }

    public get WIFArr(): Array<string> {
        return this._WIFArr || [];
    }

    public pushWalletArray(w: WalletJSON) {
        this._walletArr.push(this.parseWallet(w));
    }
    public pushWIFArray(WIF: string) {
        this._WIFArr.push(WIF);
    }

    public getWalletArrayJSON(walletArr: Array<Wallet> = null): Array<WalletJSON> {
        const res = [];
        if (walletArr === null) {
            this._walletArr.forEach(item => {
                res.push(item.export());
            });
        } else {
            walletArr.forEach(item => {
                res.push(item.export());
            });
        }
        return res;
    }

    public verifyWallet(w: Wallet): boolean {
        if (this._walletArr === []) {
            return true;
        } else {
            if (this._walletArr.findIndex(item => item.accounts[0].address === w.accounts[0].address) >= 0) {
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
        return this._wallet && this._wallet.accounts[0] && this._wallet.accounts[0].address;
    }
    constructor(
        private chrome: ChromeService,
        private global: GlobalService
    ) { }

    public clearCache() {
        this._wallet = new Wallet();
        this._walletArr = [];
        this.$wallet = new Subject();
    }

    public walletIsOpen(): Observable<boolean> {
        this.chrome.getWallet().subscribe(res => {
            this._wallet = this.parseWallet(res);
            this.$wallet.next(this._wallet);
        });
        this.chrome.getWIFArray().subscribe((res) => {
            if (res !== undefined && res !== null && res.length > 0) {
                this._WIFArr = res;
            }
        });
        return this.chrome.getWalletArray().pipe(map((res) => {
            if (res.length > 0) {
                const tempArray = [];
                res.forEach(item => {
                    tempArray.push(this.parseWallet(item));
                });
                this._walletArr = tempArray;
                this.global.log('已打开钱包', this._walletArr);
                return true;
            } else {
                return false;
            }
        }), catchError((e) => {
            this.global.log('检查钱包打开出错', e);
            return of(false);
        }));
    }
    /**
     * Create a new wallet include one NEP6 account.
     * 创建包含单个NEP6的新钱包
     * @param key encrypt password for new address
     */
    public createWallet(key: string, name: string = null): Observable<any> {
        const privateKey = this.generatePrivateKey();
        const account = new wallet.Account(privateKey);
        const w = Neon.create.wallet({ name: name || 'NeoLineUser' } as any);
        w.addAccount(account);
        const wif = w.accounts[0].WIF;
        return from(w.accounts[0].encrypt(key)).pipe(map(() => {
            (w.accounts[0] as any).wif = wif;
            return w;
        }));
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
        const index = this._walletArr.findIndex(item => item.accounts[0].address === w.accounts[0].address);
        if (w.accounts[0].address === this._wallet.accounts[0].address || w === null) {
            if (this.walletArr.length === 1) {
                this.chrome.closeWallet();
                this._walletArr.splice(index, 1);
                if (this._WIFArr.length > index) {
                    this._WIFArr.splice(index, 1);
                }
                this.chrome.setWalletArray(this.getWalletArrayJSON());
                this.chrome.setWIFArray(this._WIFArr);
                this.chrome.windowCallback({
                    data: {
                        address: this.wallet.accounts[0].address || '',
                        label: this.wallet.name || ''
                    },
                    return: EVENT.DISCONNECTED
                });
            } else {
                this._walletArr.splice(index, 1);
                if (this._WIFArr.length > index) {
                    this._WIFArr.splice(index, 1);
                }
                this._wallet = this._walletArr[0];
                this.chrome.setWallet(this._wallet.export());
                this.chrome.setWalletArray(this.getWalletArrayJSON());
                this.chrome.setWIFArray(this._WIFArr);
            }
            return of(true);

        } else {
            if (this._WIFArr.length > index) {
                this._WIFArr.splice(index, 1);
            }
            this._walletArr.splice(index, 1);
            this.chrome.setWalletArray(this.getWalletArrayJSON());
            this.chrome.setWIFArray(this._WIFArr);
            return of(false);
        }
    }

    /**
     * Create a new wallet include given private key and encrypt by given password.
     * 创建包含指定私钥的新钱包，并进行加密
     * @param privKey private key to import
     * @param key encrypt password for new address
     */
    public importPrivateKey(privKey: string, key: string, name: string = null): Observable<Wallet> {
        const account = new wallet.Account(privKey);
        const w = Neon.create.wallet({ name: name || 'NeoLineUser' } as any);
        w.addAccount(account);
        const wif = w.accounts[0].WIF;
        w.encrypt(0, key);
        return from(w.accounts[0].encrypt(key)).pipe(map(() => {
            (w.accounts[0] as any).wif = wif;
            return w;
        }));
    }
    /**
     * Create a new wallet include given private key and encrypt by given password.
     * 创建包含指定私钥的新钱包，并进行加密
     * @param privKey private key to import
     * @param key encrypt password for new address
     */
    public importWIF(wif: string, key: string, name: string = null): Observable<Wallet> {
        const account = new wallet.Account(wallet.getPrivateKeyFromWIF(wif));
        const w = Neon.create.wallet({ name: name || 'NeoLineUser' } as any);
        w.addAccount(account);
        w.encrypt(0, key);
        return from(w.accounts[0].encrypt(key)).pipe(map(() => {
            (w.accounts[0] as any).wif = wif;
            return w;
        }));
    }
    /**
     * Create a new wallet include given encrypted key and try decrypt it by given password.
     * 创建包含指定已加密私钥的钱包，并尝试解密以校验密码
     * @param encKey encrypted key to import
     * @param key encrypt password for this encKey
     */
    public importEncryptKey(encKey: string, key: string, name: string): Observable<Wallet> {
        return Observable.create((observer: Observer<Wallet>) => {
            const w = Neon.create.wallet({ name: name || 'NeoLineUser' } as any);
            w.addAccount(new wallet.Account(encKey));
            wallet.decrypt(encKey, key).then((wif) => {
                const account = new wallet.Account(wallet.getPrivateKeyFromWIF(wif));
                const returnRes = Neon.create.wallet({ name: name || 'NeoLineUser' } as any);
                returnRes.addAccount(account);
                returnRes.encrypt(0, key);
                returnRes.accounts[0].encrypt(key).then(res => {
                    (returnRes.accounts[0] as any).wif = wif;
                    observer.next(returnRes);

                });
            }).catch((err) => {
                observer.error('import failed');
            });
        });
    }
    public parseWallet(src: any): Wallet {
        if (!wallet) {
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
        return wallet.generatePrivateKey();
    }

    public createTx(fromAddress: string, to: string, balances: UTXO[], amount: number, fee: number = 0): Transaction {

        const fromScript = wallet.getScriptHashFromAddress(fromAddress);
        const toScript = wallet.getScriptHashFromAddress(to);
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
        const newTx = new tx.ContractTransaction();

        newTx.addOutput({ assetId, value: new Fixed8(amount), scriptHash: toScript });
        let curr = 0.0;
        for (const item of balances) {
            curr = this.global.mathAdd(curr, parseFloat(item.value) || 0);
            newTx.inputs.push(new TransactionInput({
                prevIndex: item.n, prevHash: item.txid.startsWith('0x') &&
                    item.txid.length === 66 ? item.txid.substring(2) : item.txid
            }));
            if (curr >= amount + fee) {
                break;
            }
        }
        const payback = (assetId === GAS || assetId === GAS.substring(2)) ?
            this.global.mathSub(this.global.mathSub(curr, amount), fee) : this.global.mathSub(curr, amount);
        if (payback < 0) {
            throw new Error('no enough balance to pay');
        }
        if (payback > 0) {
            newTx.addOutput({ assetId, value: new Fixed8(payback), scriptHash: fromScript });
        }
        const remark = 'From NeoLine';
        newTx.addAttribute(tx.TxAttrUsage.Remark1, u.str2hexstring(remark));
        return newTx;
    }
    public createTxForNEP5(fraomAddress: string, to: string, scriptHash: string, amount: number, decimals: number,
        broadcastOverride: boolean = false): Transaction {
        const fromScript = wallet.getScriptHashFromAddress(fraomAddress);
        const toScript = wallet.getScriptHashFromAddress(to);
        if (fromScript.length !== 40 || toScript.length !== 40) {
            throw new Error('target address error');
        }
        const newTx = new tx.InvocationTransaction();
        const amountBigNumber = bignumber(amount).mul(bignumber(10).pow(decimals))
        newTx.script = sc.createScript({
            scriptHash: scriptHash.startsWith('0x') && scriptHash.length === 42 ? scriptHash.substring(2) : scriptHash,
            operation: 'transfer',
            args: [
                u.reverseHex(fromScript),
                u.reverseHex(toScript),
                amountBigNumber.toNumber() >= bignumber(10).pow(16).toNumber() ?
                    this.num2hex(amountBigNumber.toString()) : amountBigNumber.toNumber()
            ]
        });
        newTx.addAttribute(tx.TxAttrUsage.Script, u.reverseHex(fromScript));
        const remark = broadcastOverride ? 'From NeoLine' : `From NeoLine at ${new Date().getTime()}`;
        newTx.addAttribute(tx.TxAttrUsage.Remark1, u.str2hexstring(remark));
        return newTx;
    }

    public getVerificationSignatureForSmartContract(ScriptHash: string): Promise<any> {
        return rpc.Query.getContractState(ScriptHash).execute(this.global.RPCDomain)
            .then(({ result }) => {
                const { parameters } = result;
                return new tx.Witness({
                    invocationScript: '00'.repeat(parameters.length),
                    verificationScript: '',
                });
            });
    }

    public claimGAS(claims: Array<ClaimItem>): Observable<Array<Transaction>> {
        return new Observable(observer => {
            const claimArr = [[]];
            const valueArr = [];
            let count = 0
            let txCount = 0;
            let itemValue = 0;
            claims.forEach(item => {
                count++;
                claimArr[txCount].push({
                    prevHash: item.txid.length === 66 ? item.txid.slice(2) : item.txid,
                    prevIndex: item.n,
                });
                itemValue = this.global.mathAdd(itemValue, Number(item.claim));
                if (count >= 20) {
                    txCount++;
                    count = 0
                    claimArr[txCount] = [];
                    valueArr.push(itemValue);
                    itemValue = 0
                }
            });
            if (itemValue !== 0) {
                valueArr.push(itemValue);
            }
            const wif = this.WIFArr[this._walletArr.findIndex(item => item.accounts[0].address === this._wallet.accounts[0].address)];
            const txArr = [];
            claimArr.forEach((item, index) => {
                const newTx = new tx.ClaimTransaction({
                    claims: item
                });
                newTx.addIntent('GAS', valueArr[index], this.address);
                newTx.sign(wif);
                txArr.push(newTx);
            })
            observer.next(txArr);
            observer.complete();
        });
    }
    public isAsset(assetId: string): boolean {
        return assetId.startsWith('0x') ? assetId.length === 66 : assetId.length === 64;
    }

    /**
     * 修改钱包名称时，web 头部名称跟着修改
     */
    public walletSub(): Observable<Wallet> {
        return this._wallet
            ? this.$wallet.pipe(startWith(this._wallet), publish(), refCount())
            : this.$wallet.pipe(publish(), refCount());
    }

    private zeroPad(input: string | any[] | sc.OpCode, length: number, padEnd?: boolean) {
        const zero = '0';
        input = String(input);

        if (padEnd) {
            return input + zero.repeat(length - input.length);
        }

        return zero.repeat(length - input.length) + input;
    }

    public parseTxHashAttr({ type, value, txAttrUsage }: TxHashAttribute): TxHashAttribute {
        let parsedValue = this.zeroPad(value, 64, true);
        switch (type) {
            case 'Boolean':
                parsedValue = this.zeroPad(!!value ? sc.OpCode.PUSHT : sc.OpCode.PUSHF, 64, true);
                break;
            case 'Address':
                parsedValue = this.zeroPad(u.reverseHex(wallet.getScriptHashFromAddress(value)), 64, true);
                break;
            case 'Integer':
                const h = Number(value).toString(16);
                parsedValue = this.zeroPad(u.reverseHex(h.length % 2 ? '0' + h : h), 64, true);
                break;
            case 'String':
                parsedValue = this.zeroPad(u.ab2hexstring(u.str2ab(value)), 64, true);
                break;
        }

        return {
            type,
            value: parsedValue,
            txAttrUsage,
        };
    }

    private num2hex(num: string): string {
        const size = 64;
        let hexstring = (Number(num.toString())).toString(16);
        hexstring =
            hexstring.length % size === 0 ?
                hexstring :
                ('0'.repeat(size) + hexstring).substring(hexstring.length);
        hexstring = u.reverseHex(hexstring);
        return hexstring
    }
}
