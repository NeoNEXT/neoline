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
import { RateObj } from '@/models/models';

@Component({
    templateUrl: 'language.dialog.html',
    styleUrls: ['language.dialog.scss']
})
export class PopupLanguageDialogComponent implements OnInit {
    public targetOption: string;
    public rateObj: RateObj;

    constructor(
        private dialogRef: MatDialogRef < PopupLanguageDialogComponent > ,
        private chromeSer: ChromeService,
        private global: GlobalService,
        private router: Router,
        @Inject(MAT_DIALOG_DATA) public data: {
            optionGroup: [],
            currentOption: string,
            type: string    // lang, currency, channel
        }
    ) {
    }

    ngOnInit() {
        this.targetOption = this.data.currentOption;
        if (this.data.type === 'channel' || this.data.type === 'currency') {
            this.chromeSer.getRateObj().subscribe(rateObj => {
                this.rateObj = rateObj;
            });
        }
    }

    public cancel() {
        this.dialogRef.close();
    }

    public select() {
        if (this.data.currentOption === this.targetOption) {
            return;
        }
        if (this.data.type === 'lang') {
            this.chromeSer.setLang(this.targetOption);
            this.global.snackBarTip('langSetSucc');
            location.href = `index.html#popup/setting`;
        } else if (this.data.type === 'channel') {
            this.rateObj.currentChannel = this.targetOption;
            this.chromeSer.setRateObj(this.rateObj);
            this.dialogRef.close(this.targetOption);
        } else if (this.data.type === 'currency') {
            this.rateObj.currentCurrency = this.targetOption;
            this.chromeSer.setRateObj(this.rateObj);
            this.dialogRef.close(this.targetOption);
        }
    }
}
