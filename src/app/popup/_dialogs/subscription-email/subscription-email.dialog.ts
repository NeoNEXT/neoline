import { Component, OnInit } from '@angular/core';
import { GlobalService, ChromeService, SettingState } from '@/app/core';
import { WalletInitConstant } from '../../_lib/constant';

@Component({
    templateUrl: 'subscription-email.dialog.html',
    styleUrls: ['subscription-email.dialog.scss'],
})
export class PopupSubscriptionEmailDialogComponent implements OnInit {
    isSelected = false;
    limit: any;
    email: string;
    emailRegExp;

    constructor(
        private global: GlobalService,
        private chrome: ChromeService,
        private settingState: SettingState
    ) {
        this.emailRegExp = new RegExp(WalletInitConstant.emailPattern);
    }

    async ngOnInit(): Promise<void> {
        this.limit = await this.settingState.getWalletInitConstant();
    }

    submit() {
        if (this.isSelected === false) {
            this.global.snackBarTip('agreePrivacyPolicy');
            return;
        }
    }

    async openPrivacyPolicy() {
        let lang = await this.chrome.getLang().toPromise();
        if (lang !== 'en') {
            lang = '';
        } else {
            lang = '/en';
        }
        window.open(`https://neoline.io${lang}/privacy`);
    }
}
