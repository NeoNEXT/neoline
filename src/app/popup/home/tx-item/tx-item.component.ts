import {
    Component,
    OnInit,
    Input
} from '@angular/core';
import { GlobalService } from '@/app/core';

@Component({
    selector: 'app-tx-item',
    templateUrl: 'tx-item.component.html',
    styleUrls: ['tx-item.component.scss', './dark.scss', './light.scss']
})
export class PopupHomeTxItemComponent implements OnInit {
    @Input() symbol = '';
    @Input() value = 0;
    @Input() txid = '';
    @Input() time = 0;
    @Input() id = -1;

    public show = false;

    constructor(
        private global: GlobalService
    ) { }
    ngOnInit(): void { }

    public txDetail(txid: string) {
        // todo
        if (this.global.apiDomain.match('main') !== null) {
            window.open(`https://blolys.com/#/mainnet/transaction/${txid}`);
        } else {
            window.open(`https://blolys.com/#/testnet/transaction/${txid}`);
        }
    }

    public copied() {
        this.global.snackBarTip('copied');
    }

    public moreInfo() {

    }

}
