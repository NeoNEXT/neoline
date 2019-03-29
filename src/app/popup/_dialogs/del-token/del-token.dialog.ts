import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';


@Component({
    templateUrl: './del-token.dialog.html',
    styleUrls: ['./del-token.dialog.scss']
})
export class PopupDelTokenDialogComponent implements OnInit {
    constructor(
        private dialogRef: MatDialogRef<PopupDelTokenDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public address: string
    ) { }

    ngOnInit() {
    }

    public cancel() {
        this.dialogRef.close();
    }

    public enter() {}

}

