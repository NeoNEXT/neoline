import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material';

@Component({
    templateUrl: 'clear-storage.dialog.html',
    styleUrls: ['clear-storage.dialog.scss']
})
export class PopupClearStorageDialogComponent {
    constructor(
        private dialogRef: MatDialogRef<PopupClearStorageDialogComponent>
    ) {}
}
