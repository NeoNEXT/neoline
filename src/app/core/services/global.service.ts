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
    MatDialogRef,
    MatSnackBar
} from '@angular/material';
import {
    LoaderDialog
} from '../dialogs/loader/loader.dialog';
import {
    environment
} from '@/environments/environment';
import {
    NotificationService
} from './notification.service';

@Injectable()
export class GlobalService {
    public get apiDomain(): string {
        return environment.apiBase;
    }
    public $wallet: Subject < string > ;
    public languageJson: any = null;
    public debug = false;

    public searchBalance: any; // web 版删除某资产时搜索结果中同步删除某资产
    constructor(
        private matDialog: MatDialog,
        private snackBar: MatSnackBar,
        private notification: NotificationService
    ) {
        this.$wallet = new Subject < string > ();
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

    public snackBarTip(msg: string, serverError = '', autoClose = true) {
        console.log(msg);
        let message = this.notification.content[msg];
        if (serverError !== '') {
            message = message + ': ' + serverError;
        }
        if (autoClose) {
            this.snackBar.open(message, this.notification.content.close, {
                horizontalPosition: 'center',
                verticalPosition: 'top',
                duration: 3000
            });
        } else {
            this.snackBar.open(message, this.notification.content.close, {
                horizontalPosition: 'center',
                verticalPosition: 'top'
            });
        }
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
}
