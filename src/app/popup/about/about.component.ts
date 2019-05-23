import { Component, OnInit } from '@angular/core';
import { ChromeService } from '@/app/core';

@Component({
    templateUrl: 'about.component.html',
    styleUrls: ['about.component.scss', './light.scss', './dark.scss']
})
export class PopupAboutComponent implements OnInit {
    public version = '';
    constructor(
        private chrome: ChromeService
    ) { }

    ngOnInit(): void {
        this.version = this.chrome.getVersion();
    }
}
