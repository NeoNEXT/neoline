import { Component, OnInit, Input } from '@angular/core';
import { GlobalService, NeonService } from '@/app/core';
import { ChainType } from '@/app/popup/_lib/constants';

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
            case ChainType.Neo2:
                if (this.global.activeNetwork.name === 'MainNet') {
                    window.open(`https://neotube.io/transaction/${txid}`);
                } else {
                    window.open(`https://testnet.neotube.io/transaction/${txid}`);
                }
                break;
            case ChainType.Neo3:
                window.open(`https://neo3.neotube.io/transaction/${txid}`);
                break;
        }
    }
}
