import {
  GlobalService,
  NeonService,
  ChromeService,
  EvmService,
} from '@/app/core';
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
  UntypedFormGroup,
  UntypedFormBuilder,
  Validators,
  ValidatorFn,
  AbstractControl,
} from '@angular/forms';
import { checkPasswords, MyErrorStateMatcher } from '../confirm-password';
import { ChainType } from '../../_lib';
import { EvmWalletJSON } from '../../_lib/evm';
import { ethers } from 'ethers';

type ImportType = 'key' | 'file' | 'mnemonic';

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
    } else if (chainType === 'Neo3') {
      if (wallet3.isWIF(wif) || wallet3.isPrivateKey(wif)) {
        valid = true;
      }
    } else if (chainType === 'NeoX') {
      if (wallet3.isPrivateKey(wif.startsWith('0x') ? wif.slice(2) : wif)) {
        valid = true;
      }
    }
    return valid === false ? { errorWIF: { value: control.value } } : null;
  };
}

function checkMnemonic(): ValidatorFn {
  return (control: AbstractControl): { [key: string]: any } | null => {
    const mnemonic = control.value;
    if (!mnemonic) {
      return null;
    }
    let valid = false;
    if (ethers.Mnemonic.isValidMnemonic(mnemonic)) {
      valid = true;
    }
    return valid === false ? { errorMnemonic: { value: control.value } } : null;
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
  importForm: UntypedFormGroup;
  hideImportPwd = true;
  hideConfirmPwd = true;
  hideWIF = true;

  importMnemonicForm: UntypedFormGroup;
  hideImportMnemonicPwd = true;
  hideConfirmMnemonicPwd = true;
  hideMnemonic = true;

  nep6Form: UntypedFormGroup;
  nep6Json;
  hideNep6FilePwd = true;
  hideNep6Pwd = true;
  hideNep6ConfirmPwd = true;
  showImportTypeMenu = false;

  importTypeList: ImportType[] = ['key', 'file'];

  @Input() password: string;
  @Input() isOnePassword: boolean;
  @Input() hasPwdWallet: boolean;
  @Input() neoXWalletArr: EvmWalletJSON[] = [];
  @Output() submitThis = new EventEmitter<any>();
  @Output() submitFile = new EventEmitter<any>();
  matcher = new MyErrorStateMatcher();
  constructor(
    private global: GlobalService,
    private neon: NeonService,
    private cdref: ChangeDetectorRef,
    private fb: UntypedFormBuilder,
    private chrome: ChromeService,
    private evmService: EvmService
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
    if (this.neon.selectedChainType === 'NeoX') {
      if (
        this.neoXWalletArr.some((item) => item.accounts[0].extra.isHDWallet)
      ) {
        this.importTypeList = ['key'];
      } else {
        this.importTypeList = ['key', 'mnemonic'];
      }
    }
    if (this.isOnePassword && this.password) {
      this.importForm = this.fb.group({
        name: ['', [Validators.required, Validators.pattern(/^.{1,32}$/)]],
        WIF: ['', [Validators.required, checkWIF(this.neon.selectedChainType)]],
      });
      this.importMnemonicForm = this.fb.group({
        name: ['', [Validators.required, Validators.pattern(/^.{1,32}$/)]],
        mnemonic: ['', [Validators.required, checkMnemonic()]],
      });
      this.nep6Form = this.fb.group({
        name: ['', [Validators.required]],
        EncrpytedKey: ['', [Validators.required]],
        filePassword: ['', [Validators.required]],
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
      this.importMnemonicForm = this.fb.group(
        {
          name: ['', [Validators.required, Validators.pattern(/^.{1,32}$/)]],
          mnemonic: ['', [Validators.required, checkMnemonic()]],
          password: [
            '',
            [Validators.required, Validators.pattern(/^.{8,128}$/)],
          ],
          confirmPassword: ['', [Validators.required]],
        },
        { validators: checkPasswords }
      );
      this.nep6Form = this.fb.group(
        {
          name: ['', [Validators.required]],
          EncrpytedKey: ['', [Validators.required]],
          filePassword: ['', [Validators.required]],
          password: [
            '',
            [Validators.required, Validators.pattern(/^.{8,128}$/)],
          ],
          confirmPassword: ['', [Validators.required]],
        },
        { validators: checkPasswords }
      );
    }
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
        if (this.neon.selectedChainType === 'NeoX') {
          if (ethers.isKeystoreJson(JSON.stringify(this.nep6Json))) {
            this.nep6Form.controls.EncrpytedKey.setValue(
              JSON.stringify(this.nep6Json)
            );
          } else {
            this.global.snackBarTip('nep6Wrong');
            this.nep6Json = null;
          }
          return;
        }
        const firstAccount = this.nep6Json?.accounts?.[0];
        if (this.neonWallet.isNEP2(firstAccount?.key)) {
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

  importMnemonic() {
    this.loading = true;
    let importPwd;
    if (this.isOnePassword && this.password) {
      importPwd = this.password;
    } else {
      importPwd = this.importMnemonicForm.value.password;
    }
    if (
      ethers.Mnemonic.isValidMnemonic(this.importMnemonicForm.value.mnemonic)
    ) {
      this.evmService
        .importWalletFromPhrase(
          this.importMnemonicForm.value.mnemonic,
          importPwd,
          this.importMnemonicForm.value.name
        )
        .then((res: any) => {
          this.loading = false;
          if (this.neon.verifyWallet(res)) {
            this.setPassword(importPwd);
            this.submitThis.emit(res);
          } else {
            this.global.snackBarTip('existingWallet');
          }
        });
    }
  }

  importKey() {
    this.loading = true;
    let importPwd;
    if (this.isOnePassword && this.password) {
      importPwd = this.password;
    } else {
      importPwd = this.importForm.value.password;
    }
    if (this.neon.selectedChainType === 'NeoX') {
      this.importNeoXKey(importPwd);
      return;
    }
    if (this.neonWallet.isPrivateKey(this.importForm.value.WIF)) {
      this.neon
        .importPrivateKey(
          this.importForm.value.WIF,
          importPwd,
          this.importForm.value.name
        )
        .subscribe((res: any) => {
          this.loading = false;
          if (this.neon.verifyWallet(res)) {
            this.setPassword(importPwd);
            this.submitThis.emit(res);
          } else {
            this.global.snackBarTip('existingWallet');
          }
        });
    } else {
      this.neon
        .importWIF(
          this.importForm.value.WIF,
          importPwd,
          this.importForm.value.name
        )
        .subscribe(
          (res: any) => {
            this.loading = false;
            if (this.neon.verifyWallet(res)) {
              this.setPassword(importPwd);
              this.submitThis.emit(res);
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
  }

  importNeoXKey(pwd: string) {
    this.evmService
      .importWalletFromPrivateKey(
        this.importForm.value.WIF,
        pwd,
        this.importForm.value.name
      )
      .then((res: EvmWalletJSON) => {
        this.loading = false;
        if (this.neon.verifyWallet(res)) {
          this.setPassword(pwd);
          this.submitThis.emit(res);
        } else {
          this.global.snackBarTip('existingWallet');
        }
      });
  }

  public cancel() {
    history.go(-1);
  }

  importNeoXFile() {
    this.loading = true;
    let importPwd;
    if (this.isOnePassword && this.password) {
      importPwd = this.password;
    } else {
      importPwd = this.nep6Form.value?.password;
    }
    ethers.Wallet.fromEncryptedJson(
      JSON.stringify(this.nep6Json),
      this.nep6Form.value.filePassword
    )
      .then(async (res) => {
        const newWallet = await this.evmService.importWalletFromPrivateKey(
          res.privateKey,
          importPwd,
          this.nep6Json?.name
        );
        this.loading = false;
        if (this.neon.verifyWallet(newWallet)) {
          this.setPassword(importPwd);
          this.submitFile.emit({ walletArr: [newWallet] });
        } else {
          this.global.snackBarTip('existingWallet');
        }
      })
      .catch(() => {
        this.loading = false;
        this.nep6Form.controls[`filePassword`].setErrors({ wrong: true });
        this.nep6Form.markAsDirty();
      });
  }

  async importFile() {
    if (this.neon.selectedChainType === 'NeoX') {
      this.importNeoXFile();
      return;
    }
    if (!this.neonWallet.isNEP2(this.nep6Form.value.EncrpytedKey)) {
      return;
    }
    this.loading = true;
    const filePwd = this.nep6Form.value.filePassword;
    let importPwd;
    if (this.isOnePassword && this.password) {
      importPwd = this.password;
    } else {
      importPwd = this.nep6Form.value?.password;
    }
    const accounts: any[] = this.nep6Json?.accounts || [];
    const newWalletArr = [];
    const newWIFArr = [];
    let isErrorPwd = false;
    for (const item of accounts) {
      const newWallet = await this.neon.importEncryptKey(
        item.key,
        filePwd,
        item?.label ?? item.address,
        importPwd
      );
      if (newWallet !== 'Wrong password') {
        if (this.neon.verifyWallet(newWallet)) {
          newWIFArr.push(
            this.isOnePassword || !this.hasPwdWallet
              ? ''
              : newWallet.accounts[0].WIF
          );
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
        this.nep6Form.controls[`filePassword`].setErrors({ wrong: true });
        this.nep6Form.markAsDirty();
      } else {
        this.global.snackBarTip('walletImportFailed');
      }
    } else {
      this.setPassword(importPwd);
      this.submitFile.emit({ walletArr: newWalletArr, wifArr: newWIFArr });
    }
  }

  setPassword(pwd: string) {
    if (!this.hasPwdWallet) {
      this.chrome.setStorage(STORAGE_NAME.onePassword, true);
      this.chrome.setPassword(pwd);
    }
  }
}
