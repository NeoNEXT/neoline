import { ErrorStateMatcher } from '@angular/material/core';
import {
  FormControl,
  FormGroupDirective,
  NgForm,
  ValidatorFn,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';

export class MyErrorStateMatcher implements ErrorStateMatcher {
  isErrorState(
    control: FormControl | null,
    form: FormGroupDirective | NgForm | null
  ): boolean {
    return control.parent.errors && control.parent.errors['notSame'];
  }
}

export const checkPasswords: ValidatorFn = (
  group: AbstractControl
): ValidationErrors | null => {
  const pass = group.get('password').value;
  const confirmPass = group.get('confirmPassword').value;
  if (pass && confirmPass && pass !== confirmPass) {
    return { notSame: true };
  }
  return null;
};
