import {
    Component,
    Inject,
    OnInit,
    AfterViewInit
} from '@angular/core';
import {
    MatDialogRef,
    MAT_DIALOG_DATA
} from '@angular/material/dialog';
import {
    GlobalService,
} from '@/app/core';

@Component({
    templateUrl: './add-token.dialog.html',
    styleUrls: ['./add-token.dialog.scss']
})
export class PopupAddTokenDialogComponent implements OnInit {
    constructor(
        private dialogRef: MatDialogRef < PopupAddTokenDialogComponent > ,
        @Inject(MAT_DIALOG_DATA) public asset: any,
        public global: GlobalService,
    ) {}

    ngOnInit() {
        if (!this.asset.balance || this.asset.balance === 0) {
            this.asset.rateBalance = 0;
        }
    }

    public cancel() {
        this.dialogRef.close();
    }
    public enter() {}
}
