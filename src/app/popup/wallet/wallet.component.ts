import { Component, OnInit, AfterContentInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { NeonService, ChromeService, GlobalService } from '@/app/core';
import { FormControl } from '@angular/forms';
@Component({
    templateUrl: 'wallet.component.html',
    styleUrls: ['wallet.component.scss']
})

export class PopupWalletComponent implements OnInit {
    public createStatus = 'hibernate';
    public importStatus = '';

    public selected = new FormControl(2);

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService,
    ) {
        this.initOperate(router.url);
    }

    public initOperate(url: string) {
        const urlParse = url.split('/');
        if (urlParse.length === 3) {
            this.createStatus = '';
            this.importStatus = 'hibernate';
            this.selected.setValue(0)
        } else {
            this.selected.setValue(urlParse[3] === 'import' ? 1 : 0)
        }
    }

    public updateLocalWallet(data: any, type: number) {

        this.neon.pushWIFArray(data.accounts[0].wif);
        this.chrome.setWIFArray(this.neon.WIFArr);
        this.neon.pushWalletArray(data.export());
        this.chrome.setWalletArray(this.neon.getWalletArrayJSON());
        this.chrome.setWallet(data.export());
        this.global.$wallet.next('open');
        if(type === 0) {
            this.chrome.setHaveBackupTip(true);
        } else {
            this.chrome.setWalletsStatus(this.neon.address)
            this.chrome.setHaveBackupTip(false);
        }
        const returnUrl = this.route.snapshot.queryParams.returnUrl || (type === 0 ?'/popup/backup' : '/popup');
        this.router.navigateByUrl(returnUrl);
    }

    ngOnInit(): void { }
}
