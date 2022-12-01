import { GlobalService, NeonService } from '@/app/core';
import {
  AfterContentInit,
  Component,
  EventEmitter,
  OnInit,
  Output,
  ChangeDetectorRef,
  AfterContentChecked,
} from '@angular/core';
import { WalletInitConstant } from '../../_lib/constant';
import { WalletImport } from '../../_lib/models';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';

type ImportType = 'key' | 'file';

@Component({
  selector: 'wallet-import',
  templateUrl: 'import.component.html',
  styleUrls: ['import.component.scss'],
})
export class PopupWalletImportComponent
  implements OnInit, AfterContentInit, AfterContentChecked
{
  neonWallet: any = wallet2;

  public loading = false;
  public isInit = true;
  public limit = WalletInitConstant;

  public importType: ImportType = 'key';
  public walletImport = new WalletImport();
  public hideImportPwd = true;
  public hideConfirmPwd = true;
  public hideWIF = true;
  public isWIF = true;

  public walletNep6Import = new WalletImport();
  public nep6File: any;
  public nep6Json: Wallet2 | Wallet3 = null;
  public nep6Name = '';
  public hideNep6Pwd = true;
  showImportTypeMenu = false;

  @Output() submit = new EventEmitter<any>();

  constructor(
    private global: GlobalService,
    private neon: NeonService,
    private cdref: ChangeDetectorRef
  ) {
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

  ngAfterContentChecked() {
    this.cdref.detectChanges();
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
        this.walletNep6Import.EncrpytedKey = (
          this.nep6Json.accounts[0] as any
        ).key;
      };
      reader.onerror = () => {
        console.log('error reading file');
      };
    }
  }

  public submitImport(): void {
    if (this.importType === 'key') {
      if (
        !this.neonWallet.isWIF(this.walletImport.WIF) &&
        !this.neonWallet.isPrivateKey(this.walletImport.WIF)
      ) {
        this.isWIF = false;
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
            console.log(err);
            this.loading = false;
            this.global.log('import wallet faild', err);
            if (err === 'Wrong password') {
              this.global.snackBarTip('wrongPassword', '');
            } else {
              this.global.snackBarTip('walletImportFailed', '');
            }
          }
        );
    }
  }

  public cancel() {
    history.go(-1);
  }
}
