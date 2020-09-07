import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ChromeService, NeonService, GlobalService } from '@app/core';
import { WalletInitConstant } from '@popup/_lib/constant';

@Component({
    templateUrl: './input.dialog.html',
    styleUrls: ['./input.dialog.scss']
})
export class PopupInputDialogComponent implements OnInit {
    public inputText = '';

    constructor(
        private dialogRef: MatDialogRef<PopupInputDialogComponent>,
        private chrome: ChromeService,
        private global: GlobalService,
        private neon: NeonService,
        @Inject(MAT_DIALOG_DATA) private data: {
            type: string,
            title: string
        }
    ) {}

    ngOnInit() {}

    public cancel() {
        this.dialogRef.close('');
    }

    public confirm() {
        this.dialogRef.close(this.inputText);
    }
}
