import { Component, OnInit, Input } from '@angular/core';
import { GlobalService } from '@/app/core';

@Component({
    selector: 'tx-item',
    templateUrl: 'tx-item.component.html',
    styleUrls: ['tx-item.component.scss']
})
export class TxItemComponent implements OnInit {
    @Input() public time: number = 0;
    @Input() public value: string = '';
    @Input() public txid: string = '';
    @Input() public id: number;
    constructor(
        private global: GlobalService
    ) { }

    ngOnInit(): void { }

    public txDetail(txid: string) {
        if (this.global.net === 'MainNet') {
            window.open(`https://neotube.io/transaction/${txid}`);
        } else {
            window.open(`https://testnet.neotube.io/transaction/${txid}`);
        }
    }
}
