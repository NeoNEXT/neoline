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
    Wallet
} from '@cityofzion/neon-core/lib/wallet';
import {
    wallet
} from '@cityofzion/neon-core';
import { ERRORS, returnTarget, EVENT } from '@/models/dapi';

@Component({
    templateUrl: './authorization.component.html',
    styleUrls: ['./authorization.component.scss']
})
export class PopupNoticeAuthComponent implements OnInit {
    public iconSrc = '';
    public hostname = '';
    public title = '';
    public wallet: Wallet;
    public address = '';
    public accountName = '';
    private paramsData: any;

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
            this.iconSrc = params.icon;
            this.hostname = params.hostname;
            this.title = params.title;
            if (params.network) {
                if (params.network === 'MainNet') {
                    this.global.modifyNet('main');
                } else {
                    this.global.modifyNet('test');
                }
            }
        });
    }

    ngOnInit() {
        window.onbeforeunload = () => {
            this.chrome.windowCallback({
                data: ERRORS.CANCELLED,
                target: returnTarget.Connect
            });
        };
    }
    public refuse() {
        this.chrome.getAuthorization().subscribe(res => {
            if (this.ruleCheck) {
                res[this.hostname] = {
                    icon: this.iconSrc,
                    title: this.title,
                    status: this.ruleSelected
                };
                this.chrome.setAuthorization(res);
            }
            this.chrome.windowCallback({
                data: false,
                target: returnTarget.Connect
            });
            window.close();
        });
    }
    public connect() {
        this.chrome.getAuthorization().subscribe(res => {
            if (this.ruleCheck) {
                res[this.hostname] = {
                    icon: this.iconSrc,
                    title: this.title,
                    status: this.ruleSelected
                };
                this.chrome.setAuthorization(res);
            }
            this.chrome.windowCallback({
                data: true,
                target: returnTarget.Connect
            });
            this.chrome.windowCallback({
                data: true,
                target: EVENT.CONNECTED
            });
            let queryString = '';
            for (const key in this.paramsData) {
                if (this.paramsData.hasOwnProperty(key)) {
                    queryString += `${key}=${this.paramsData[key]}&`;
                }
            }
            window.close();
        });
    }
}
