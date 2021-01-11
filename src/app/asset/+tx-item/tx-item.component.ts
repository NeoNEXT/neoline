import { Component, OnInit, Input } from '@angular/core';
import { GlobalService, NeonService } from '@/app/core';

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
        private global: GlobalService,
        private neon: NeonService
    ) { }

    ngOnInit(): void { }

    public txDetail(txid: string) {
        switch (this.neon.currentWalletChainType) {
            case 'Neo2':
                if (this.global.net === 'MainNet') {
                    window.open(`https://neotube.io/transaction/${txid}`);
                } else {
                    window.open(`https://testnet.neotube.io/transaction/${txid}`);
                }
                break;
            case 'Neo3':
                window.open(`https://neo3.neotube.io/transaction/${txid}`);
                break;
        }
    }
}
