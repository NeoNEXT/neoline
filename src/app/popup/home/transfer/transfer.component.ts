import {
    Component,
    OnInit,
    Input
} from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

@Component({
    selector: 'app-transfer',
    templateUrl: 'transfer.component.html',
    styleUrls: ['transfer.component.scss']
})
export class PopupHomeTransferComponent implements OnInit {
    @Input() assetId: string;

    constructor(
        private dialog: MatDialog,
        private router: Router
    ) { }

    ngOnInit(): void { }

    public transfer() {
        this.router.navigate([{ outlets: { transfer: [ 'transfer', 'create', this.assetId ] } }]);
    }

    public receive() {
        this.router.navigate([{ outlets: { transfer: ['transfer', 'receive'] } }]);
    }
}
