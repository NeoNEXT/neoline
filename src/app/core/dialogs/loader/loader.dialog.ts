import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';

@Component({
    templateUrl: 'loader.dialog.html',
    styleUrls: ['loader.dialog.scss']
})
export class LoaderDialog implements OnInit {
    constructor(
        private dialogRef: MatDialogRef<LoaderDialog>,
        @Inject(MAT_DIALOG_DATA) public data: {msg: string, cancelable: boolean}
    ) { }

    ngOnInit(): void { }
}
