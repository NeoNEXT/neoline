import {
    Component,
    OnInit,
    Input
} from '@angular/core';

@Component({
    selector: 'app-tx-item',
    templateUrl: 'tx-item.component.html',
    styleUrls: ['tx-item.component.scss']
})
export class PopupHomeTxItemComponent implements OnInit {
    @Input() symbol = '';
    @Input() value = 0;
    @Input() txid = '';
    @Input() time = 0;
    @Input() id = -1;

    constructor() { }
    ngOnInit(): void { }

    public txDetail(txid: string) {
        // todo
        window.open(`https://blolys.com/#/mainnet/transaction/${ txid }`);
    }

    public moreInfo() {

    }
}
