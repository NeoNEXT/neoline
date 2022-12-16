import { GlobalService, NeonService } from '@/app/core';
import {
  AfterContentInit,
  Component,
  EventEmitter,
  OnInit,
  Output,
} from '@angular/core';
import { FormGroup, Validators, FormBuilder } from '@angular/forms';
import { checkPasswords, MyErrorStateMatcher } from '../confirm-password';
import { WalletInitConstant } from '../../_lib';

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
  @Output() submit = new EventEmitter<any>();

  createForm: FormGroup;
  matcher = new MyErrorStateMatcher();
  constructor(
    private global: GlobalService,
    private neon: NeonService,
    private fb: FormBuilder
  ) {}

  ngOnInit() {
    this.createForm = this.fb.group(
      {
        name: ['', [Validators.required, Validators.pattern(/^.{1,32}$/)]],
        password: ['', [Validators.required, Validators.pattern(/^.{8,128}$/)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: checkPasswords }
    );
  }

  ngAfterContentInit(): void {
    setTimeout(() => {
      this.isInit = false;
    });
  }

  public submitCreate(): void {
    this.loading = true;
    this.neon
      .createWallet(
        this.createForm.value.password,
        this.createForm.value.walletName
      )
      .subscribe(
        (res: any) => {
          if (this.neon.verifyWallet(res)) {
            this.submit.emit(res);
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
