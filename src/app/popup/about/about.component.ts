import { Component, OnInit } from '@angular/core';
import { ChromeService } from '@/app/core';

@Component({
    templateUrl: 'about.component.html',
    styleUrls: ['about.component.scss']
})
export class PopupAboutComponent implements OnInit {
    public version = '';
    constructor(
        private chrome: ChromeService
    ) { }

    ngOnInit(): void {
        this.version = this.chrome.getVersion();
    }

    public async jumbToWeb(type: number) {
        let lang = await this.chrome.getLang().toPromise()
        if (lang !== 'en') {
            lang = ''
        } else {
            lang = '/en'
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
        }
    }
}
