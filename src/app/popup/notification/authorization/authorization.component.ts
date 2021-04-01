import {
    Component,
    OnInit,
    OnDestroy
} from '@angular/core';
import {
    ChromeService,
    NeonService,
    NotificationService,
    GlobalService
} from '@/app/core';
import {
    ActivatedRoute,
    Router
} from '@angular/router';
import {
    wallet as wallet3
} from '@cityofzion/neon-core-neo3';

import { ERRORS, EVENT , requestTarget } from '@/models/dapi';

@Component({
    templateUrl: './authorization.component.html',
    styleUrls: ['./authorization.component.scss']
})
export class PopupNoticeAuthComponent implements OnInit {
    public iconSrc = '';
    public hostname = '';
    public title = '';
    public wallet;
    public address = '';
    public accountName = '';
    private paramsData: any;

    chainType = 'Neo';
    public ruleCheck = false;
    public ruleSelected = 'true';
    constructor(
        private chrome: ChromeService,
        private aRouter: ActivatedRoute,
        private neon: NeonService,
        private router: Router,
        private notificationI18n: NotificationService,
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
            this.chrome.getWallet().subscribe(res => {
                if (res && wallet3.isAddress(res.accounts[0].address)) {
                    this.chainType = 'Neo3';
                }
            })
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
    public connect() {
        if (this.chainType === 'Neo3') {
            this.global.snackBarTip('PleaseSwitchToNeo2');
            return;
        }
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
