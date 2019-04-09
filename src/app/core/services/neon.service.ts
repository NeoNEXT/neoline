import { Injectable } from '@angular/core';
import Neon, { wallet, tx, nep5 } from '@cityofzion/neon-js';
import { Wallet, WalletJSON } from '@cityofzion/neon-core/lib/wallet';
import { Observable, from, Observer, of, Subject } from 'rxjs';
import { map, catchError, startWith, publish, refCount } from 'rxjs/operators';
import { ChromeService } from './chrome.service';
import { GlobalService } from './global.service';
import { Transaction, TransactionInput } from '@cityofzion/neon-core/lib/tx';
import { UTXO } from '@/models/models';
import { Fixed8 } from '@cityofzion/neon-core/lib/u';
import { sc, u } from '@cityofzion/neon-core';

@Injectable()
export class NeonService {
    private _wallet: Wallet;
    private _walletArr: Array<Wallet> = [];

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

    public pushWalletArray(w: WalletJSON) {
        this._walletArr.push(this.parseWallet(w));
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
     * Create a new wallet include one NEP2 account.
     * 创建包含单个NEP2的新钱包
     * @param key encrypt password for new address
     */
    public createWallet(key: string, name: string = null): Observable<any> {
        const privateKey = this.generatePrivateKey();
        const account = new wallet.Account(privateKey);
        const w = Neon.create.wallet({ name: name || 'NEOLineUser' } as any);
        w.addAccount(account);
        return from(w.accounts[0].encrypt(key)).pipe(map(() => {
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
                this.chrome.setWalletArray(this.getWalletArrayJSON());
            } else {
                this._walletArr.splice(index, 1);
                this._wallet = this._walletArr[0];
                this.chrome.setWallet(this._wallet.export());
                this.chrome.setWalletArray(this.getWalletArrayJSON());
            }
            return of(true);

        } else {
            this._walletArr.splice(index, 1);
            this.chrome.setWalletArray(this.getWalletArrayJSON());
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
        const w = Neon.create.wallet({ name: name || 'NEOLineUser' } as any);
        w.addAccount(account);
        w.encrypt(0, key);
        return from(w.accounts[0].encrypt(key)).pipe(map(() => {
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
        const w = Neon.create.wallet({ name: name || 'NEOLineUser' } as any);
        w.addAccount(account);
        w.encrypt(0, key);
        return from(w.accounts[0].encrypt(key)).pipe(map(() => {
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
            const w = Neon.create.wallet({ name: name || 'NEOLineUser' } as any);
            w.addAccount(new wallet.Account(encKey));
            wallet.decrypt(encKey, key).then((wif) => {
                const account = new wallet.Account(wallet.getPrivateKeyFromWIF(wif));
                const returnRes = Neon.create.wallet({ name: name || 'NEOLineUser' } as any);
                returnRes.addAccount(account);
                returnRes.encrypt(0, key);
                returnRes.accounts[0].encrypt(key).then(res => {
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

    public createTx(from: string, to: string, balances: UTXO[], amount: number): Transaction {
        const fromScript = wallet.getScriptHashFromAddress(from);
        const toScript = wallet.getScriptHashFromAddress(to);
        if (fromScript.length != 40 || toScript.length != 40) {
            throw 'target address error';
        }
        if (balances.length == 0) {
            throw 'no balance';
        }
        let assetId = balances[0].asset_id;
        if (assetId.startsWith('0x') && assetId.length == 66) {
            assetId = assetId.substring(2);
        }
        const newTx = new tx.ContractTransaction();
        newTx.addOutput({ assetId: assetId, value: new Fixed8(amount), scriptHash: toScript });
        var curr = 0.0
        for (var item of balances) {
            curr += parseFloat(item.value) || 0;
            newTx.inputs.push(new TransactionInput({ prevIndex: item.n, prevHash: item.txid.startsWith('0x') && item.txid.length == 66 ? item.txid.substring(2) : item.txid }))
            if (curr >= amount) {
                break
            }
        }
        const payback = curr - amount
        if (payback < 0) {
            throw 'no enough balance to pay';
        }
        if (payback > 0) {
            newTx.addOutput({ assetId: assetId, value: new Fixed8(payback), scriptHash: fromScript });
        }
        return newTx;
    }
    public createTxForNEP5(from: string, to: string, scriptHash: string, amount: number): Transaction {
        const fromScript = wallet.getScriptHashFromAddress(from);
        const toScript = wallet.getScriptHashFromAddress(to);
        if (fromScript.length != 40 || toScript.length != 40) {
            throw 'target address error';
        }
        const newTx = new tx.InvocationTransaction();
        newTx.script = sc.createScript({
            scriptHash: scriptHash.startsWith('0x') && scriptHash.length == 42 ? scriptHash.substring(2) : scriptHash,
            operation: 'transfer',
            args: [
                u.reverseHex(fromScript),
                u.reverseHex(toScript),
                sc.ContractParam.byteArray(new u.Fixed8(amount), 'fixed8'),
            ]
        }) + 'f1';
        newTx.addAttribute(tx.TxAttrUsage.Script, u.reverseHex(fromScript));
        let uniqTag = `from NEOLine at ${new Date().getTime()}`;
        newTx.addAttribute(tx.TxAttrUsage.Remark1, u.reverseHex(u.str2hexstring(uniqTag)));
        return newTx;
    }
    public isAsset(assetId: string): boolean {
        return assetId.startsWith('0x') ? assetId.length == 66 : assetId.length == 64;
    }

    /**
     * 修改钱包名称时，web 头部名称跟着修改
     */
    public walletSub(): Observable<Wallet> {
        return this._wallet
            ? this.$wallet.pipe(startWith(this._wallet), publish(), refCount())
            : this.$wallet.pipe(publish(), refCount());
    }
}
