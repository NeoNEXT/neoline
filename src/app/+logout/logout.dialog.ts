import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
    templateUrl: './logout.dialog.html',
    styleUrls: ['./logout.dialog.scss']
})
export class LogoutDialog implements OnInit {
    constructor(
        private dialogRef: MatDialogRef<LogoutDialog>
    ) {}

    ngOnInit() { }
    public ok() {
        this.dialogRef.close(true);
    }
}
