import { Component, OnInit, AfterContentInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { NeonService, ChromeService, GlobalService } from '@/app/core';
import { FormControl } from '@angular/forms';
import { STORAGE_NAME } from '../_lib';
@Component({
    templateUrl: 'wallet.component.html',
    styleUrls: ['wallet.component.scss'],
})
export class PopupWalletComponent implements OnInit {
    public createStatus = 'hibernate';
    public importStatus = '';
    public type: 'dapi' = null;
    public hostname: string;
    public chainType: string;
    public messageID: string;

    public selected = new FormControl(2);

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private neon: NeonService,
        private chrome: ChromeService,
        private global: GlobalService
    ) {
        this.initOperate(router.url);
        this.route.queryParams.subscribe((params: any) => {
            this.type = params.type;
            this.hostname = params.hostname;
            this.chainType = params.chainType;
            this.messageID = params.messageID;
        });
    }

    public initOperate(url: string) {
        const urlParse = url.split('/');
        if (urlParse.length === 3) {
            this.createStatus = '';
            this.importStatus = 'hibernate';
            this.selected.setValue(0);
        } else {
            this.selected.setValue(urlParse[3].startsWith('import') ? 1 : 0);
        }
    }

    public updateLocalWallet(data: any, type: number) {
        this.neon.pushWIFArray(data.accounts[0].wif);
        this.chrome.setStorage(
            this.neon.selectedChainType === 'Neo3'
                ? STORAGE_NAME['WIFArr-Neo3']
                : STORAGE_NAME.WIFArr,
            this.neon.WIFArr
        );
        this.neon.pushWalletArray(data.export());
        this.chrome.setStorage(
            this.neon.selectedChainType === 'Neo3'
                ? STORAGE_NAME['walletArr-Neo3']
                : STORAGE_NAME.walletArr,
            this.neon.getWalletArrayJSON()
        );
        if (this.type === 'dapi') {
            const params = `type=dapi&hostname=${this.hostname}&chainType=${this.chainType}&messageID=${this.messageID}`;
            this.router.navigateByUrl(
                `/popup/notification/pick-address?${params}`
            );
            return;
        }
        this.chrome.setWallet(data.export());
        this.global.$wallet.next('open');
        if (type === 0) {
            this.chrome.setHaveBackupTip(true);
        } else {
            this.chrome.setWalletsStatus(data.accounts[0].address);
            this.chrome.setHaveBackupTip(false);
        }
        const returnUrl =
            this.route.snapshot.queryParams.returnUrl ||
            (type === 0 ? '/popup/backup' : '/popup');
        this.router.navigateByUrl(returnUrl);
    }

    ngOnInit(): void {}
}
