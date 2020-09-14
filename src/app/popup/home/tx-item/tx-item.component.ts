import {
    Component,
    OnInit,
    Input
} from '@angular/core';
import { GlobalService } from '@/app/core';

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

    public show = false;

    constructor(
        private global: GlobalService
    ) { }
    ngOnInit(): void { }

    public txDetail(txid: string) {
        // todo
        if (this.global.net === 'MainNet') {
            window.open(`https://neotube.io/transaction/${txid}`);
        } else {
            window.open(`https://testnet.neotube.io/transaction/${txid}`);
        }
    }

    public copied() {
        this.global.snackBarTip('copied');
    }

    public moreInfo() {

    }

}
