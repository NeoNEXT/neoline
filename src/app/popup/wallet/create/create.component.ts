import {
  GlobalService,
  ChromeService,
  NeoWalletService,
} from '@/app/core';
import {
  AfterContentInit,
  Component,
  EventEmitter,
  OnInit,
  Output,
  Input,
} from '@angular/core';
import {
  UntypedFormGroup,
  Validators,
  UntypedFormBuilder,
} from '@angular/forms';
import { checkPasswords, MyErrorStateMatcher } from '../confirm-password';
import { WalletInitConstant, STORAGE_NAME } from '../../_lib';

@Component({
  selector: 'wallet-create',
  templateUrl: 'create.component.html',
  styleUrls: ['../common.scss'],
})
export class PopupWalletCreateComponent implements OnInit, AfterContentInit {
  limit = WalletInitConstant;
  hidePwd = true;
  hideConfirmPwd = true;
  loading = false;
  isInit: boolean;
  @Input() password: string;
  @Input() isOnePassword: boolean;
  @Input() hasPwdWallet: boolean;
  @Output() submitThis = new EventEmitter<any>();

  createForm: UntypedFormGroup;
  matcher = new MyErrorStateMatcher();
  constructor(
    private global: GlobalService,
    private fb: UntypedFormBuilder,
    private chrome: ChromeService,
    private neoWalletService: NeoWalletService
  ) {}

  ngOnInit() {
    const nameValidators = [
      Validators.required,
      Validators.pattern(/^.{1,32}$/),
    ];
    if (this.isOnePassword && this.password) {
      this.createForm = this.fb.group({
        name: ['', nameValidators],
      });
    } else {
      this.createForm = this.fb.group(
        {
          name: ['', nameValidators],
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

  public submitCreate(): void {
    if (this.createForm.invalid || this.loading) {
      return;
    }
    this.loading = true;
    let createPwd;
    if (this.isOnePassword && this.password) {
      createPwd = this.password;
    } else {
      createPwd = this.createForm.value.password;
    }
    this.neoWalletService
      .createWallet(createPwd, this.createForm.value.name)
      .then(
        (res: any) => {
          if (this.neoWalletService.verifyWallet(res)) {
            if (!this.hasPwdWallet) {
              this.chrome.setStorage(STORAGE_NAME.onePassword, true);
              this.chrome.setPassword(createPwd);
            }
            this.submitThis.emit(res);
          } else {
            this.global.snackBarExistWalletTip(
              this.neoWalletService.getSameWallet(res) || res
            );
          }
          this.loading = false;
        },
        (err: any) => {
          this.global.log('create wallet faild', err);
          this.global.snackBarTip('walletCreateFailed');
          this.loading = false;
        }
      );
  }

  public cancel() {
    history.go(-1);
  }
}
