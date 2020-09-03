import {
    Component,
    OnInit,
    Inject
} from '@angular/core';
import {
    MatDialogRef, MAT_DIALOG_DATA,
} from '@angular/material/dialog';

import {
    ChromeService, AssetState,
} from '@app/core';

@Component({
    templateUrl: 'confirm.component.html',
    styleUrls: ['confirm.component.scss']
})
export class PopupTransferConfirmComponent implements OnInit {
    public logoUrlArr = [];
    public net = '';
    constructor(
        private dialogRef: MatDialogRef<PopupTransferConfirmComponent>,
        @Inject(MAT_DIALOG_DATA) public data: {
        }
    ) { }

    ngOnInit() {
        console.log('confirm');
    }

    public select(index: number) {
        this.dialogRef.close(index);
    }

    public exit() {
        this.dialogRef.close();
    }
}
