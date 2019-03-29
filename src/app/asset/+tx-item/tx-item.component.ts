import { Component, OnInit, Input } from '@angular/core';

@Component({
    selector: 'tx-item',
    templateUrl: 'tx-item.component.html',
    styleUrls: ['tx-item.component.scss']
})
export class TxItemComponent implements OnInit {
    @Input() public time: number = 0;
    @Input() public value: string = '';
    @Input() public txid: string = '';
    constructor() { }

    ngOnInit(): void { }

    public txDetail(txid: string) {
        window.open(`https://blolys.com/#/mainnet/transaction/${ txid }`);
    }
}
