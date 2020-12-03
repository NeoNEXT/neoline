import { GlobalService, NeonService } from '@/app/core';
import {
    AfterContentInit,
    Component,
    EventEmitter,
    OnInit,
    Output,
} from '@angular/core';
import { WalletInitConstant } from '../../_lib/constant';
import { WalletCreation, WalletImport } from '../../_lib/models';
import { Observable, of } from 'rxjs';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-js-neo3';
import { Wallet } from '@cityofzion/neon-core/lib/wallet';

@Component({
    selector: 'wallet-import',
    templateUrl: 'import.component.html',
    styleUrls: ['import.component.scss'],
})
export class PopupWalletImportComponent implements OnInit, AfterContentInit {
    neonWallet: any = wallet2;

    public loading = false;
    public isInit: boolean;
    public limit: any;

    public importType = '0';
    public walletImport: WalletImport;
    public hideImportPwd: boolean;
    public hideConfirmPwd: boolean;
    public hideWIF: boolean;
    public isWIF = true;

    public walletNep6Import: WalletImport;
    public nep6File: any;
    public nep6Json: Wallet = null;
    public nep6Name = '';
    public hideNep6Pwd: boolean;

    @Output() submit = new EventEmitter<any>();
    constructor(private global: GlobalService, private neon: NeonService) {
        this.isInit = true;
        this.limit = WalletInitConstant;

        this.walletImport = new WalletImport();
        this.hideImportPwd = true;
        this.hideWIF = true;
        this.hideConfirmPwd = true;

        this.walletNep6Import = new WalletImport();
        this.hideNep6Pwd = true;
        switch (this.neon.selectedChainType) {
            case 'Neo2':
                this.neonWallet = wallet2;
                break;
            case 'Neo3':
                this.neonWallet = wallet3;
                break;
        }
    }

    ngOnInit() {}

    ngAfterContentInit(): void {
        setTimeout(() => {
            this.isInit = false;
        });
    }

    public onFileSelected(event: any) {
        this.nep6File = event.target.files[0];
        if (this.nep6File) {
            const reader = new FileReader();
            reader.readAsText(this.nep6File, 'UTF-8');
            reader.onload = (evt: any) => {
                this.nep6Json = JSON.parse(evt.target.result);
                if (
                    this.nep6Json.accounts === undefined ||
                    this.nep6Json.accounts[0] === undefined ||
                    !this.neonWallet.isNEP2(
                        (this.nep6Json.accounts[0] as any).key ||
                            this.nep6Json.name === undefined ||
                            this.nep6Json.name === ''
                    )
                ) {
                    this.global.snackBarTip('nep6Wrong');
                    this.nep6Json = null;
                    this.nep6Name = '';
                    this.walletNep6Import.walletName = '';
                }
                if (this.nep6Json.name !== undefined) {
                    this.nep6Name = this.nep6Json.name;
                    this.walletNep6Import.walletName = this.nep6Json.name;
                }
                this.walletNep6Import.EncrpytedKey = (this.nep6Json
                    .accounts[0] as any).key;
            };
            reader.onerror = (evt) => {
                console.log('error reading file');
            };
        }
    }

    public submitImport(): void {
        if (this.importType === '0') {
            if (
                !this.neonWallet.isWIF(this.walletImport.WIF) &&
                !this.neonWallet.isPrivateKey(this.walletImport.WIF)
            ) {
                this.isWIF = false;
                console.log(this.isWIF);
                return;
            }
            this.loading = true;
            if (this.neonWallet.isPrivateKey(this.walletImport.WIF)) {
                this.neon
                    .importPrivateKey(
                        this.walletImport.WIF,
                        this.walletImport.password,
                        this.walletImport.walletName
                    )
                    .subscribe((res: any) => {
                        this.loading = false;
                        if (this.neon.verifyWallet(res)) {
                            this.submit.emit(res);
                        } else {
                            this.global.snackBarTip('existingWallet');
                        }
                    });
            } else {
                this.neon
                    .importWIF(
                        this.walletImport.WIF,
                        this.walletImport.password,
                        this.walletImport.walletName
                    )
                    .subscribe(
                        (res: any) => {
                            this.loading = false;
                            if (this.neon.verifyWallet(res)) {
                                this.submit.emit(res);
                            } else {
                                this.global.snackBarTip('existingWallet');
                            }
                        },
                        (err: any) => {
                            this.global.log('import wallet faild', err);
                            this.global.snackBarTip('walletImportFailed');
                            this.loading = false;
                        }
                    );
            }
        } else {
            if (!this.neonWallet.isNEP2(this.walletNep6Import.EncrpytedKey)) {
                return;
            }
            this.loading = true;
            this.neon
                .importEncryptKey(
                    this.walletNep6Import.EncrpytedKey,
                    this.walletNep6Import.password,
                    this.walletNep6Import.walletName
                )
                .subscribe(
                    (res: any) => {
                        this.loading = false;
                        if (this.neon.verifyWallet(res)) {
                            this.submit.emit(res);
                        } else {
                            this.global.snackBarTip('existingWallet');
                        }
                    },
                    (err: any) => {
                        this.loading = false;
                        this.global.log('import wallet faild', err);
                        this.global.snackBarTip('walletImportFailed', '');
                    }
                );
        }
    }

    public cancel() {
        history.go(-1);
    }
}
