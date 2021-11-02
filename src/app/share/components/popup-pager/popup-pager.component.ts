import {
    Component,
    OnInit,
    Input,
    Output,
    EventEmitter
} from '@angular/core';

import { PageData } from '@/models/models';

@Component({
    selector: 'app-popup-pager',
    templateUrl: 'popup-pager.component.html',
    styleUrls: ['popup-pager.component.scss']
})
export class PopupPagerComponent implements OnInit {
    @Input() currentPage = 1;
    @Input() totalPageCount = 0;
    @Input() totalItemCount = 0;

    // tslint:disable-next-line:no-output-on-prefix
    @Output() onPage = new EventEmitter<any>();

    constructor() { }

    ngOnInit(): void { }

    public page(currentPage: any) {
        this.onPage.emit(currentPage);
    }
}
