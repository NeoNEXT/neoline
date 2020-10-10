import { Component, OnInit } from '@angular/core';
import { ChromeService } from '@/app/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupSubscriptionEmailDialogComponent } from '../_dialogs';

@Component({
    templateUrl: 'about.component.html',
    styleUrls: ['about.component.scss']
})
export class PopupAboutComponent implements OnInit {
    public version = '';
    constructor(private chrome: ChromeService, private dialog: MatDialog) {}

    ngOnInit(): void {
        this.version = this.chrome.getVersion();
    }

    public async jumbToWeb(type: number) {
        let lang = await this.chrome.getLang().toPromise();
        if (lang !== 'en') {
            lang = '';
        } else {
            lang = '/en';
        }
        switch (type) {
            case 0:
                window.open(`https://neoline.io${lang}/privacy`);
                break;
            case 1:
                window.open(`https://neoline.io${lang}/agreement`);
                break;
            case 2:
                window.open(`https://neoline.io${lang}`);
                break;
            case 3:
                window.open(`mailto:support@neoline.io`);
                break;
        }
    }

    openSubscription() {
        this.dialog.open(PopupSubscriptionEmailDialogComponent, {
            panelClass: 'custom-dialog-panel'
        });
    }
}
