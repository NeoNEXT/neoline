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
    AssetState
} from '@app/core';
import {
    Router
} from '@angular/router';

@Component({
    templateUrl: 'language.dialog.html',
    styleUrls: ['language.dialog.scss']
})
export class PopupLanguageDialogComponent implements OnInit {
    public targetOption: string;
    public rateCurrency: string;

    constructor(
        private dialogRef: MatDialogRef < PopupLanguageDialogComponent > ,
        private chromeSer: ChromeService,
        private global: GlobalService,
        private router: Router,
        private AssetSer: AssetState,
        @Inject(MAT_DIALOG_DATA) public data: {
            optionGroup: [],
            currentOption: string,
            type: string // lang, currency
        }
    ) {}

    ngOnInit() {
        this.rateCurrency = this.AssetSer.rateCurrency;
        this.targetOption = this.data.currentOption;
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
        } else if (this.data.type === 'currency') {
            this.rateCurrency = this.targetOption;
            this.AssetSer.rateCurrency = this.rateCurrency;
            this.chromeSer.setRateCurrency(this.rateCurrency);
            this.dialogRef.close(this.targetOption);
        }
    }
}
