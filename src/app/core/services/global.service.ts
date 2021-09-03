import {
    Injectable
} from '@angular/core';
import {
    Subject,
    Observable
} from 'rxjs';
import {
    publish,
    refCount
} from 'rxjs/operators';
import {
    MatDialog,
    MatDialogRef
} from '@angular/material/dialog';

import {
    MatSnackBar
} from '@angular/material/snack-bar';
import {
    LoaderDialog
} from '../dialogs/loader/loader.dialog';
import {
    environment
} from '@/environments/environment';
import {
    NotificationService
} from './notification.service';
import {
    ChromeService
} from './chrome.service';
import { evaluate, add, subtract, multiply, divide, bignumber } from 'mathjs';
import { randomBytes, pbkdf2 } from 'crypto';
import CryptoJS from 'crypto-js';
import { resolve } from 'path';
import { HttpErrorResponse } from '@angular/common/http';
import { ChainType } from '@/app/popup/_lib';

@Injectable()
export class GlobalService {
    public apiDomain: string;
    public RPCDomain: string;
    public Neo3RPCDomain: string;
    public $wallet: Subject < string > ;
    public languageJson: any = null;
    public debug = false;
    public net: string;
    private source404 = new Subject<string>();
    public $404 = this.source404.asObservable();

    constructor(
        private matDialog: MatDialog,
        private snackBar: MatSnackBar,
        private notification: NotificationService,
        private chromeSer: ChromeService
    ) {
        this.$wallet = new Subject < string > ();
        this.chromeSer.getNet().subscribe(net => {
            this.net = net;
            this.modifyNet(net);
        });
    }

    public push404(error: string) {
        this.source404.next(error);
    }

    public modifyNet(net: string) {
        this.net = net;
        if (net === 'MainNet') {
            this.apiDomain = environment.mainApiBase;
            this.RPCDomain = environment.mainRPC;
            this.Neo3RPCDomain = environment.neo3MainRPC;
        } else {
            this.apiDomain = environment.mainApiBase;
            this.RPCDomain = environment.testRPC;
            this.Neo3RPCDomain = environment.neo3TestRPC;
        }
    }
    public log(...params: any[]) {
        if (this.debug) {
            console.log(...params);
        }
    }
    /**
     * Use to listen wallet open/close.
     */
    public walletListen(): Observable < string > {
        return this.$wallet.pipe(publish(), refCount());
    }

    public loader(msg: string, cancelable: boolean = false): MatDialogRef < LoaderDialog > {
        return this.matDialog.open(LoaderDialog, {
            data: {
                msg,
                cancelable
            },
            disableClose: !cancelable,
            panelClass: 'dialog-transparent'
        });
    }

    public logoError(img: Event) {
        (img.target as any).src = '/assets/images/logo.png';
    }

    public handlePrcError(error, chain: ChainType) {
        let errorMessage = error?.message || this.notification.content.transferFailed;
        if (chain === 'Neo2' && error?.code === -505) {
            errorMessage = this.notification.content.InsufficientNetworkFee;
        }
        this.snackBar.open(errorMessage, this.notification.content.close, {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 3000
        });
    }

    public snackBarTip(msg: string, serverError: any = '', time = 3000) {
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
            duration: time
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
    public mathDiv(a: number, b: number): number {
        return parseFloat(divide(bignumber(a), bignumber(b)).toString());
    }
    public getUseAgent() {
        const defaultAgent = navigator.userAgent;
        const agentArr = defaultAgent.split(' ');
        let res = '';
        agentArr.forEach(item => {
            if(item.match('Chrome') !== null) {
                res += item;
            }
        })
        res += ` AppVersion/${this.chromeSer.getVersion() ? this.chromeSer.getVersion() : 'debug'}`;
        return res;
    }
}
