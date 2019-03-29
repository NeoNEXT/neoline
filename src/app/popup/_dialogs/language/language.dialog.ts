import {
    Component,
    Inject,
    OnInit
} from '@angular/core';
import {
    MatDialogRef,
    MAT_DIALOG_DATA
} from '@angular/material';

import {
    ChromeService,
    GlobalService,
} from '@app/core';
import {
    Router
} from '@angular/router';

@Component({
    templateUrl: 'language.dialog.html',
    styleUrls: ['language.dialog.scss']
})
export class PopupLanguageDialogComponent implements OnInit {
    public lang: string;

    constructor(
        private dialogRef: MatDialogRef < PopupLanguageDialogComponent > ,
        private chromeSer: ChromeService,
        private global: GlobalService,
        private router: Router,
        @Inject(MAT_DIALOG_DATA) public address: string
    ) {
        this.chromeSer.getLang().subscribe((res) => {
            this.lang = res;
        }, (err) => {
            this.global.log('get lang setting failed', err);
            this.lang = 'zh_CN';
        });
    }

    ngOnInit() {}

    public cancel() {
        this.dialogRef.close();
    }

    public select() {
        this.chromeSer.setLang(this.lang);
        this.global.snackBarTip('langSetSucc');
        location.href = `index.html#popup/setting`;
    }
}
