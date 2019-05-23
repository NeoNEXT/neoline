import { Component, OnInit } from '@angular/core';
import { ChromeService } from '@/app/core';

@Component({
    templateUrl: 'about.component.html',
    styleUrls: ['about.component.scss']
})
export class SettingAboutComponent implements OnInit {
    public version = '';
    constructor(
        private chrome: ChromeService
    ) { }

    ngOnInit(): void {
        this.version = this.chrome.getVersion();
    }
}
