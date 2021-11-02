import { Component, OnInit } from '@angular/core';
import {
    MatDialogRef
} from '@angular/material/dialog';

@Component({
    templateUrl: 'pwd.dialog.html',
    styleUrls: ['pwd.dialog.scss']
})
export class PwdDialog implements OnInit {
    public input: string = '';
    constructor(
        private dialogRef: MatDialogRef<PwdDialog>
    ) {}

    ngOnInit(): void { }
    public submit() {
        if (this.input && this.input.length) {
            this.dialogRef.close(this.input);
        }
    }
}
