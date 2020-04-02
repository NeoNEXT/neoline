import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
    templateUrl: 'clear-storage.dialog.html',
    styleUrls: ['clear-storage.dialog.scss']
})
export class PopupClearStorageDialogComponent {
    constructor(
        private dialogRef: MatDialogRef<PopupClearStorageDialogComponent>
    ) {}
}
