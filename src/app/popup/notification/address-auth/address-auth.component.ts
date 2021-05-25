import {
    Component,
    OnInit,
} from '@angular/core';
import {
    ChromeService,
    NeonService,
    GlobalService
} from '@/app/core';
import {
    ActivatedRoute,
} from '@angular/router';

import { ERRORS, EVENT , requestTarget } from '@/models/dapi';

@Component({
    templateUrl: './address-auth.component.html',
    styleUrls: ['./address-auth.component.scss']
})
export class PopupAddressAuthComponent implements OnInit {
    public iconSrc = '';
    public hostname = '';
    public title = '';
    public wallet;
    public address = '';
    public accountName = '';
    private paramsData: any;

    public ruleCheck = false;
    public ruleSelected = 'true';
    constructor(
        private chrome: ChromeService,
        private aRouter: ActivatedRoute,
        private neon: NeonService,
        private global: GlobalService
    ) {
        this.wallet = this.neon.wallet;
        this.address = this.wallet.accounts[0].address;
        this.accountName = this.wallet.name;
        this.aRouter.queryParams.subscribe((params: any) => {
            this.paramsData = params;
            this.hostname = params.hostname;
            if(params === undefined || params.icon === undefined) {
                this.iconSrc = '/assets/images/default_asset_logo.jpg'
            } else {
                this.iconSrc =  this.hostname.indexOf('flamingo') >= 0 ? '/assets/images/flamingo.ico' : params.icon;
            }
            this.title = params.title;
            if (params.network) {
                if (params.network === 'MainNet') {
                    this.global.modifyNet('MainNet');
                } else {
                    this.global.modifyNet('TestNet');
                }
            }
        });
    }

    ngOnInit() {
        window.onbeforeunload = () => {
            this.chrome.windowCallback({
                data: ERRORS.CANCELLED,
                return: requestTarget.Connect
            });
        };
    }
    public refuse() {
        this.chrome.getAuthorization().subscribe(res => {
            if (this.ruleCheck) {
                if (res[this.neon.wallet.accounts[0].address] === undefined) {
                    res[this.neon.wallet.accounts[0].address] = [];
                }
                res[this.neon.wallet.accounts[0].address].push({
                    hostname: this.hostname,
                    icon: this.iconSrc,
                    title: this.title,
                    status: this.ruleSelected
                });
                this.chrome.setAuthorization(res);
            }
            this.chrome.windowCallback({
                data: false,
                return: requestTarget.Connect
            });
            window.close();
        });
    }
    public confirm() {
        this.chrome.getAuthorization().subscribe(res => {

            this.chrome.windowCallback({
                data: true,
                return: requestTarget.Connect
            });
            this.chrome.windowCallback({
                data: {
                    address: this.neon.address || '',
                    label: this.neon.wallet.name || ''
                },
                return: EVENT.CONNECTED
            });
            window.close();
        });
    }
}
