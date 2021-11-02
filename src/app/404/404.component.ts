import { Component, OnInit } from '@angular/core';
import { GlobalService } from '@app/core';

@Component({
    template: `404 not found`,
    styles: [``]
})
export class N404Component implements OnInit {
    constructor(
        private globalSer: GlobalService
    ) { }

    ngOnInit(): void {
        this.globalSer.push404('error');
    }
}
