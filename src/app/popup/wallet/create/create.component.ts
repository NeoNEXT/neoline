import { GlobalService, NeonService, ChromeService } from '@/app/core';
import {
  AfterContentInit,
  Component,
  EventEmitter,
  OnInit,
  Output,
  Input,
} from '@angular/core';
import { UntypedFormGroup, Validators, UntypedFormBuilder } from '@angular/forms';
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
    private neon: NeonService,
    private fb: UntypedFormBuilder,
    private chrome: ChromeService
  ) {}

  ngOnInit() {
    if (this.isOnePassword && this.password) {
      this.createForm = this.fb.group({
        name: ['', [Validators.required, Validators.pattern(/^.{1,32}$/)]],
      });
    } else {
      this.createForm = this.fb.group(
        {
          name: ['', [Validators.required, Validators.pattern(/^.{1,32}$/)]],
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
    this.loading = true;
    let createPwd;
    if (this.isOnePassword && this.password) {
      createPwd = this.password;
    } else {
      createPwd = this.createForm.value.password;
    }
    this.neon.createWallet(createPwd, this.createForm.value.name).then(
      (res: any) => {
        if (this.neon.verifyWallet(res)) {
          if (!this.hasPwdWallet) {
            this.chrome.setStorage(STORAGE_NAME.onePassword, true);
            this.chrome.setPassword(createPwd);
          }
          this.submitThis.emit(res);
        } else {
          this.global.snackBarTip('existingWallet');
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
