import {
    Component,
    Input,
    OnInit,
} from '@angular/core';

@Component({
    selector: 'app-tx-filter',
    templateUrl: 'tx-filter.component.html',
    styleUrls: ['tx-filter.component.scss']
})
export class PopupHomeTxFilterComponent implements OnInit {
    @Input() totalCount = 0;
    @Input() totalPage = 0;

    constructor() { }
    ngOnInit(): void { }
}
