import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
    templateUrl: 'wallet.component.html',
    styleUrls: ['wallet.component.scss']
})
export class WalletComponent implements OnInit {
    constructor(
        private router: Router,
        private aRouter: ActivatedRoute
    ) { }
    public importType = 'PrivateKey';

    ngOnInit(): void {
        const tempArr = location.href.split('/');
        this.importType = tempArr[tempArr.length - 1];
    }

    public importTypeChoose(type: string) {
        if (type === this.importType) {
            return;
        } else {
            this.importType = type;
            this.router.navigateByUrl(`/wallet/import/${this.importType}`);
        }
    }
}
