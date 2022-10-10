import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import {
    ChromeService,
    GlobalService,
    AssetState,
    NeonService,
    SettingState,
} from '@app/core';
import { Router } from '@angular/router';
import { ChainType, SelectItem, STORAGE_NAME } from '@popup/_lib';

@Component({
    templateUrl: 'select.dialog.html',
    styleUrls: ['select.dialog.scss'],
})
export class PopupSelectDialogComponent implements OnInit {
    public targetOption: string;
    public rateCurrency: string;

    constructor(
        private dialogRef: MatDialogRef<PopupSelectDialogComponent>,
        private chromeSer: ChromeService,
        private global: GlobalService,
        private router: Router,
        private assetSer: AssetState,
        private neonService: NeonService,
        private settingState: SettingState,
        @Inject(MAT_DIALOG_DATA)
        public data: {
            optionGroup: SelectItem[];
            currentOption: string;
            type: 'lang' | 'currency' | 'chain'; // lang, currency
        }
    ) {}

    ngOnInit() {
        this.rateCurrency = this.assetSer.rateCurrency;
        this.targetOption = this.data.currentOption;
    }

    public cancel() {
        this.dialogRef.close();
    }

    public select(targetOption: any) {
        this.targetOption = targetOption;
        if (this.data.currentOption === targetOption) {
            return;
        }
        switch (this.data.type) {
            case 'lang':
                this.settingState.changLang(this.targetOption);
                this.chromeSer.setStorage(STORAGE_NAME.lang, this.targetOption);
                this.global.snackBarTip('langSetSucc');
                this.dialogRef.close();
                break;
            case 'currency':
                this.rateCurrency = this.targetOption;
                this.assetSer.rateCurrency = this.rateCurrency;
                this.chromeSer.setStorage(
                    STORAGE_NAME.rateCurrency,
                    this.rateCurrency
                );
                this.dialogRef.close(this.targetOption);
                break;
            case 'chain':
                this.neonService.selectChainType(
                    this.targetOption as ChainType
                );
                this.dialogRef.close(this.targetOption);
        }
    }
}
