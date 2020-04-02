import { Component } from '@angular/core';
import {
    MatDialogRef
} from '@angular/material/dialog';

@Component({
    templateUrl: 'logout.dialog.html',
    styleUrls: ['logout.dialog.scss']
})
export class PopupLogoutDialogComponent {
    constructor(
        private dialogRef: MatDialogRef<PopupLogoutDialogComponent>
    ) {}
}
