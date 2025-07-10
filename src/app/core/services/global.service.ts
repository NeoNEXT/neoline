import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '@/environments/environment';
import { NotificationService } from './notification.service';
import { add, subtract, multiply, bignumber } from 'mathjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ChainType } from '@/app/popup/_lib';
import * as Sentry from '@sentry/angular';

@Injectable()
export class GlobalService {
  public apiDomain: string;
  public debug = false;
  private source404 = new Subject<string>();
  public $404 = this.source404.asObservable();

  constructor(
    private snackBar: MatSnackBar,
    private notification: NotificationService
  ) {
    this.apiDomain = environment.mainApiBase;
  }

  public push404(error: string) {
    this.source404.next(error);
  }

  public log(...params: any[]) {
    if (this.debug) {
      console.log(...params);
    }
  }

  public handlePrcError(error, chain: ChainType) {
    Sentry.captureException({error, chain});
    let errorMessage = error?.message || this.notification.content.txFailed;
    if (chain === 'Neo2' && error?.code === -505) {
      errorMessage = this.notification.content.InsufficientNetworkFee;
    }
    this.snackBar.open(errorMessage, this.notification.content.close, {
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: 3000,
    });
  }

  public snackBarTip(msg: string, serverError: any = '', time = 3000) {
    Sentry.captureException({ msg, serverError });
    let message = this.notification.content[msg] || msg;
    if (serverError instanceof HttpErrorResponse) {
      serverError = serverError.statusText;
    } else if (typeof serverError !== 'string') {
      serverError = '';
    }
    if (serverError !== '') {
      message = message + ': ' + serverError;
    }
    this.snackBar.open(message, this.notification.content.close, {
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: time,
    });
  }

  // request service
  public formatQuery(query) {
    let target = '';
    for (const key in query) {
      if (target.length === 0) {
        target += key + '=' + query[key];
      } else {
        target += '&' + key + '=' + query[key];
      }
    }
    if (target.length > 0) {
      target = '?' + target;
    }
    return target;
  }

  public mathAdd(a: number, b: number): number {
    return parseFloat(add(bignumber(a), bignumber(b)).toString());
  }
  public mathSub(a: number, b: number): number {
    return parseFloat(subtract(bignumber(a), bignumber(b)).toString());
  }
  public mathmul(a: number, b: number): number {
    return parseFloat(multiply(bignumber(a), bignumber(b)).toString());
  }
}
