import { GlobalService, NeonService, ChromeService } from '@/app/core';
import {
  AfterContentInit,
  Component,
  EventEmitter,
  OnInit,
  Output,
  ChangeDetectorRef,
  AfterContentChecked,
  Input,
} from '@angular/core';
import { WalletInitConstant, STORAGE_NAME } from '../../_lib/constant';
import { wallet as wallet2 } from '@cityofzion/neon-js';
import { wallet as wallet3 } from '@cityofzion/neon-core-neo3';
import {
  FormGroup,
  FormBuilder,
  Validators,
  ValidatorFn,
  AbstractControl,
} from '@angular/forms';
import { checkPasswords, MyErrorStateMatcher } from '../confirm-password';
import { ChainType } from '../../_lib';

type ImportType = 'key' | 'file';

function checkWIF(chainType: ChainType): ValidatorFn {
  return (control: AbstractControl): { [key: string]: any } | null => {
    const wif = control.value;
    if (!wif) {
      return null;
    }
    let valid = false;
    if (chainType === 'Neo2') {
      if (wallet2.isWIF(wif) || wallet2.isPrivateKey(wif)) {
        valid = true;
      }
    } else {
      if (wallet3.isWIF(wif) || wallet3.isPrivateKey(wif)) {
        valid = true;
      }
    }
    return valid === false ? { errorWIF: { value: control.value } } : null;
  };
}

@Component({
  selector: 'wallet-import',
  templateUrl: 'import.component.html',
  styleUrls: ['import.component.scss'],
})
export class PopupWalletImportComponent
  implements OnInit, AfterContentInit, AfterContentChecked
{
  private neonWallet: any = wallet2;

  loading = false;
  isInit = true;
  limit = WalletInitConstant;

  importType: ImportType = 'key';
  importForm: FormGroup;
  hideImportPwd = true;
  hideConfirmPwd = true;
  hideWIF = true;

  nep6Form: FormGroup;
  nep6Json;
  hideNep6Pwd = true;
  showImportTypeMenu = false;

  @Input() password: string;
  @Input() hasPwdWallet: boolean;
  @Output() submit = new EventEmitter<any>();
  @Output() submitFile = new EventEmitter<any>();
  matcher = new MyErrorStateMatcher();
  constructor(
    private global: GlobalService,
    private neon: NeonService,
    private cdref: ChangeDetectorRef,
    private fb: FormBuilder,
    private chrome: ChromeService
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

  ngOnInit() {
    if (this.password) {
      this.importForm = this.fb.group({
        name: ['', [Validators.required, Validators.pattern(/^.{1,32}$/)]],
        WIF: ['', [Validators.required, checkWIF(this.neon.selectedChainType)]],
      });
    } else {
      this.importForm = this.fb.group(
        {
          name: ['', [Validators.required, Validators.pattern(/^.{1,32}$/)]],
          WIF: [
            '',
            [Validators.required, checkWIF(this.neon.selectedChainType)],
          ],
          password: [
            '',
            [Validators.required, Validators.pattern(/^.{8,128}$/)],
          ],
          confirmPassword: ['', [Validators.required]],
        },
        { validators: checkPasswords }
      );
    }
    this.nep6Form = this.fb.group({
      name: ['', [Validators.required]],
      EncrpytedKey: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });
  }

  ngAfterContentInit(): void {
    setTimeout(() => {
      this.isInit = false;
    });
  }

  ngAfterContentChecked() {
    this.cdref.detectChanges();
  }

  public onFileSelected(event: any) {
    const nep6File = event.target.files[0];
    this.nep6Form.controls.name.setValue(nep6File.name);
    if (nep6File) {
      const reader = new FileReader();
      reader.readAsText(nep6File, 'UTF-8');
      reader.onload = (evt: any) => {
        this.nep6Json = JSON.parse(evt.target.result);
        const firstAccount = this.nep6Json?.accounts?.[0];
        if (this.neonWallet.isNEP2(firstAccount?.key) && firstAccount?.label) {
          this.nep6Form.controls.EncrpytedKey.setValue(firstAccount.key);
        } else {
          this.global.snackBarTip('nep6Wrong');
          this.nep6Json = null;
        }
      };
      reader.onerror = () => {
        console.log('error reading file');
      };
    }
  }

  public submitImport(): void {
    if (this.importType === 'key') {
      this.loading = true;
      if (this.neonWallet.isPrivateKey(this.importForm.value.WIF)) {
        this.neon
          .importPrivateKey(
            this.importForm.value.WIF,
            this.password || this.importForm.value.password,
            this.importForm.value.name
          )
          .subscribe((res: any) => {
            this.loading = false;
            if (this.neon.verifyWallet(res)) {
              this.setPassword(this.importForm.value.password);
              this.submit.emit(res);
            } else {
              this.global.snackBarTip('existingWallet');
            }
          });
      } else {
        this.neon
          .importWIF(
            this.importForm.value.WIF,
            this.password || this.importForm.value.password,
            this.importForm.value.name
          )
          .subscribe(
            (res: any) => {
              this.loading = false;
              if (this.neon.verifyWallet(res)) {
                this.setPassword(this.importForm.value.password);
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
      if (!this.neonWallet.isNEP2(this.nep6Form.value.EncrpytedKey)) {
        return;
      }
      this.handleImportFile();
    }
  }

  public cancel() {
    history.go(-1);
  }

  private async handleImportFile() {
    this.loading = true;
    const filePwd = this.nep6Form.value.password;
    const accounts: any[] = this.nep6Json?.accounts || [];
    const newWalletArr = [];
    const newWIFArr = [];
    let isErrorPwd = false;
    for (const item of accounts) {
      const newWallet = await this.neon.importEncryptKey(
        item.key,
        filePwd,
        item.label,
        this.password || filePwd
      );
      if (newWallet !== 'Wrong password') {
        if (this.neon.verifyWallet(newWallet)) {
          newWIFArr.push(newWallet.accounts[0].WIF);
          const pushWallet =
            this.neon.selectedChainType === 'Neo2'
              ? new wallet2.Wallet(newWallet.export())
              : new wallet3.Wallet(newWallet.export());
          newWalletArr.push(pushWallet);
        }
      } else {
        isErrorPwd = true;
      }
    }
    this.loading = false;
    if (newWalletArr.length === 0) {
      if (isErrorPwd) {
        this.global.snackBarTip('wrongPassword');
      } else {
        this.global.snackBarTip('walletImportFailed');
      }
    } else {
      this.setPassword(filePwd);
      this.submitFile.emit({ walletArr: newWalletArr, wifArr: newWIFArr });
    }
  }

  setPassword(pwd: string) {
    if (!this.hasPwdWallet) {
      this.chrome.setStorage(STORAGE_NAME.onePassword, true);
      this.chrome.setStorage(STORAGE_NAME.password, pwd);
    }
  }
}
