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
  hideNep6Pwd = true;
  showImportTypeMenu = false;

  @Output() submit = new EventEmitter<any>();
  matcher = new MyErrorStateMatcher();
  constructor(
    private global: GlobalService,
    private neon: NeonService,
    private cdref: ChangeDetectorRef,
    private fb: FormBuilder
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
    this.importForm = this.fb.group(
      {
        name: ['', [Validators.required, Validators.pattern(/^.{1,32}$/)]],
        WIF: ['', [Validators.required, checkWIF(this.neon.selectedChainType)]],
        password: ['', [Validators.required, Validators.pattern(/^.{8,128}$/)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: checkPasswords }
    );
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
    if (nep6File) {
      const reader = new FileReader();
      reader.readAsText(nep6File, 'UTF-8');
      reader.onload = (evt: any) => {
        let nep6Json = JSON.parse(evt.target.result);
        if (
          nep6Json.accounts === undefined ||
          nep6Json.accounts[0] === undefined ||
          !this.neonWallet.isNEP2(
            (nep6Json.accounts[0] as any).key ||
              nep6Json.name === undefined ||
              nep6Json.name === ''
          )
        ) {
          this.global.snackBarTip('nep6Wrong');
          nep6Json = null;
          this.nep6Form.controls.name.setValue('');
        }
        if (nep6Json.name !== undefined) {
          this.nep6Form.controls.name.setValue(nep6Json.name);
        }
        this.nep6Form.controls.EncrpytedKey.setValue(
          (nep6Json.accounts[0] as any).key
        );
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
            this.importForm.value.password,
            this.importForm.value.name
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
            this.importForm.value.WIF,
            this.importForm.value.password,
            this.importForm.value.name
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
      if (!this.neonWallet.isNEP2(this.nep6Form.value.EncrpytedKey)) {
        return;
      }
      this.loading = true;
      this.neon
        .importEncryptKey(
          this.nep6Form.value.EncrpytedKey,
          this.nep6Form.value.password,
          this.nep6Form.value.name
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
