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
import {
    ChromeService
} from './chrome.service';

@Injectable()
export class GlobalService {
    public apiDomain: string;
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
        } else {
            this.apiDomain = environment.testApiBase;
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

    public snackBarTip(msg: string, serverError = '') {
        let message = this.notification.content[msg];
        if (serverError !== '') {
            message = message + ': ' + serverError;
        }
        this.snackBar.open(message, this.notification.content.close, {
            horizontalPosition: 'center',
            verticalPosition: 'top',
            duration: 3000
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
}
