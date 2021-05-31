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
import { requestTargetN3 } from '@/models/dapi_neo3';

@Component({
    templateUrl: './pick-address.component.html',
    styleUrls: ['./pick-address.component.scss']
})
export class PopupPickAddressComponent implements OnInit {
    @ViewChild('walletContainer') private walletContainer: ElementRef;
    public walletArr: Array<Wallet2>;
    public selectedWalletArr: { Neo2: Account; Neo3: Account; } = {
        Neo2: {
            address: '',
            label: '',
        },
        Neo3: {
            address: '',
            label: '',
        }
    };
    public allAuthWalletArr = {};
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
            this.tabType = params.chainType;
        });
        this.chrome.getAuthorizedAddresses().subscribe(selectedWalletArr => {
            this.selectedWalletArr = selectedWalletArr[this.hostname] || this.selectedWalletArr;
            this.allAuthWalletArr = selectedWalletArr || {};
        });
        this.chrome.getWalletArray(this.tabType).subscribe(walletArr => this.walletArr = walletArr);
    }

    ngOnInit() {
        if (this.tabType === 'Neo2') {
            window.onbeforeunload = () => {
                this.chrome.windowCallback({
                    error: ERRORS.CANCELLED,
                    ID: this.messageID,
                    return: requestTarget.PickAddress
                });
            };
        } else if (this.tabType === 'Neo3') {
            window.onbeforeunload = () => {
                this.chrome.windowCallback({
                    error: ERRORS.CANCELLED,
                    ID: this.messageID,
                    return: requestTargetN3.PickAddress
                });
            };
        }

    }

    public handleSelectWallet(wallet: Wallet2 | Wallet3) {
        if (this.selectedWalletArr[this.tabType].address === wallet.accounts[0].address) {
            this.selectedWalletArr[this.tabType] = {
                label: '',
                address: ''
            };
        } else {
            this.selectedWalletArr[this.tabType] = {
                label: wallet.name,
                address: wallet.accounts[0].address
            };
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
        if (this.tabType === 'Neo2') {
            this.chrome.windowCallback({
                error: ERRORS.CANCELLED,
                ID: this.messageID,
                return: requestTarget.PickAddress
            });
            window.close();
        } else if (this.tabType === 'Neo3') {
            this.chrome.windowCallback({
                error: ERRORS.CANCELLED,
                ID: this.messageID,
                return: requestTargetN3.PickAddress
            });
            window.close();
        }
    }
    public confirm() {
        this.allAuthWalletArr[this.hostname] = this.selectedWalletArr;
        this.chrome.setAuthorizedAddresses(this.allAuthWalletArr);
        if (this.tabType === 'Neo2') {
            this.chrome.windowCallback({
                data: this.selectedWalletArr,
                ID: this.messageID,
                return: requestTarget.PickAddress
            });
            window.close();
        } else if (this.tabType === 'Neo3') {
            this.chrome.windowCallback({
                error: ERRORS.CANCELLED,
                ID: this.messageID,
                return: requestTargetN3.PickAddress
            });
            window.close();
        }
    }
}
