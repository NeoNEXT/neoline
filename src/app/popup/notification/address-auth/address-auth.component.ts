import {
    Component,
    ElementRef,
    OnInit,
    ViewChild,
} from '@angular/core';
import {
    ChromeService,
} from '@/app/core';
import {
    ActivatedRoute,
} from '@angular/router';
import { Account, ERRORS, requestTarget } from '@/models/dapi';
import { Wallet as Wallet3 } from '@cityofzion/neon-core-neo3/lib/wallet';
import { Wallet as Wallet2 } from '@cityofzion/neon-core/lib/wallet';
import { ChainType } from '../../_lib';

declare class authWallet {
    selected: boolean;
    wallet: Wallet2 | Wallet3;
}
@Component({
    templateUrl: './address-auth.component.html',
    styleUrls: ['./address-auth.component.scss']
})
export class PopupAddressAuthComponent implements OnInit {
    @ViewChild('walletContainer') private walletContainer: ElementRef;
    public walletArr: { Neo2: Array<authWallet>; Neo3: Array<authWallet> } = {
        Neo2: [],
        Neo3: [],
    };
    public selectedWalletArr: { Neo2: Array<Account>; Neo3: Array<Account> } = {
        Neo2: [],
        Neo3: [],
    };
    public allAuthWalletArr = {};
    public wallet: Wallet2 | Wallet3;
    public tabType: ChainType = 'Neo2';
    public hostname = '';
    public messageID = '';

    public ruleCheck = false;
    public ruleSelected = 'true';
    constructor(
        private chrome: ChromeService,
        private aRouter: ActivatedRoute,
    ) {
        this.aRouter.queryParams.subscribe((params: any) => {
            this.hostname = params.hostname;
            this.messageID = params.messageID;
        });
        this.chrome.getWallet().subscribe(currWallet => {
            this.wallet = currWallet;
        });
        this.chrome.getAuthorizedAddresses().subscribe(selectedWalletArr => {
            this.selectedWalletArr = selectedWalletArr[this.hostname] || this.selectedWalletArr;
            this.allAuthWalletArr = selectedWalletArr;
        });
        this.chrome.getWalletArray('Neo2').subscribe(walletArrNeo2 => {
            this.walletArr.Neo2 = walletArrNeo2.map(wallet => {
                let account = {
                    wallet: wallet,
                    selected: false
                };
                for (let i = 0; i < this.selectedWalletArr.Neo2.length; i++) {
                    if (
                        this.selectedWalletArr.Neo2[i].address === wallet.accounts[0].address
                    ) {
                        account.selected = true;
                    }
                };
                return account;
            });
        });
        this.chrome.getWalletArray('Neo3').subscribe(walletArrNeo3 => {
            this.walletArr.Neo3 = walletArrNeo3.map(wallet => {
                let account = {
                    wallet: wallet,
                    selected: false
                };
                for (let i = 0; i < this.selectedWalletArr.Neo3.length; i++) {
                    if (
                        this.selectedWalletArr.Neo3[i].address === wallet.accounts[0].address
                    ) {
                        account.selected = true;
                    };
                };
                return account;
            });
        });
    }

    ngOnInit() {
        window.onbeforeunload = () => {
            this.chrome.windowCallback({
                error: ERRORS.CANCELLED,
                ID: this.messageID,
                return: requestTarget.AuthAddress
            });
        };
    }

    public handleSelectWallet(item: authWallet, index: number) {
        if (this.wallet && (item.wallet.accounts[0].address === this.wallet.accounts[0].address)) {
            return;
        }
        this.walletArr[this.tabType][index].selected = !this.walletArr[this.tabType][index].selected;
        if (this.walletArr[this.tabType][index].selected) {
            this.selectedWalletArr[this.tabType].push({
                label: item.wallet.name,
                address: item.wallet.accounts[0].address
            });
        } else {
            this.selectedWalletArr[this.tabType] = this.selectedWalletArr[this.tabType].filter(account =>
                account.address !== item.wallet.accounts[0].address
            );
        }
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
        this.chrome.windowCallback({
            error: ERRORS.CANCELLED,
            ID: this.messageID,
            return: requestTarget.AuthAddress
        });
        window.close();
    }
    public confirm() {
        this.allAuthWalletArr[this.hostname] = this.selectedWalletArr;
        this.chrome.setAuthorizedAddress(this.allAuthWalletArr);
        this.chrome.windowCallback({
            data: this.selectedWalletArr,
            ID: this.messageID,
            return: requestTarget.AuthAddress
        });
        window.close();
    }
}
