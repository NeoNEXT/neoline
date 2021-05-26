import {
    Component,
    ElementRef,
    OnInit,
    ViewChild,
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
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { ChainType } from '../../_lib';

@Component({
    templateUrl: './address-auth.component.html',
    styleUrls: ['./address-auth.component.scss']
})
export class PopupAddressAuthComponent implements OnInit {
    @ViewChild('walletContainer') private walletContainer: ElementRef;
    public walletArr: { Neo2: Array<Wallet2 | Wallet3>; Neo3: Array<Wallet2 | Wallet3> } = {
        Neo2: [],
        Neo3: [],
    };
    public currWallet: Wallet2 | Wallet3;
    public wallet: Wallet2 | Wallet3;
    public tabType: ChainType = 'Neo2';
    public iconSrc = '';
    public hostname = '';
    public title = '';
    public address = '';
    public accountName = '';

    public ruleCheck = false;
    public ruleSelected = 'true';
    constructor(
        private chrome: ChromeService,
        private aRouter: ActivatedRoute,
        private neon: NeonService,
        private global: GlobalService
    ) {
        this.chrome.getWalletArray('Neo2').subscribe(walletArrNeo2 => { this.walletArr.Neo2 = walletArrNeo2 });
        this.chrome.getWalletArray('Neo3').subscribe(walletArrNeo3 => { this.walletArr.Neo3 = walletArrNeo3 });
        this.chrome.getWallet().subscribe(currWallet => { this.currWallet = currWallet });

        this.wallet = this.neon.wallet;
        this.address = this.wallet.accounts[0].address;
        this.accountName = this.wallet.name;
        this.aRouter.queryParams.subscribe((params: any) => {
            this.hostname = params.hostname;
            console.log(this.hostname);
            if(params === undefined || params.icon === undefined) {
                this.iconSrc = '/assets/images/default_asset_logo.jpg'
            } else {
                this.iconSrc =  this.hostname.indexOf('flamingo') >= 0 ? '/assets/images/flamingo.ico' : params.icon;
            }
            this.title = params.title;
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

    public selectAccount() {

    }

    public scrollToBottom() {
        try {
            this.walletContainer.nativeElement.scrollTo(
                0,
                this.walletContainer.nativeElement.scrollHeight
            );
        } catch (err) {}
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
