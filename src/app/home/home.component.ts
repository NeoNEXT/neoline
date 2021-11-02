import { Component, OnInit } from '@angular/core';
import { NeonService, GlobalService, ChromeService } from '../core';

@Component({
    templateUrl: 'home.component.html',
    styles: [''],
})
export class HomeComponent implements OnInit {
    constructor(
        private neon: NeonService,
        private global: GlobalService,
        private chrome: ChromeService
    ) { }

    ngOnInit(): void {
    }
}
