import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
    templateUrl: 'result.component.html',
    styleUrls: ['result.component.scss']
})
export class TransferResultComponent implements OnInit {
    constructor(
        private router: Router
    ) { }

    ngOnInit(): void { }

    public close() {
        this.router.navigate([{ outlets: { transfer: null } }]);
    }
}
