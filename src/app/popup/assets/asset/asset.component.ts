import {
    Component,
    OnInit,
    Input,
    Output,
    EventEmitter,
} from '@angular/core';
import {
    Balance,
    NEO,
    GAS,
    EXT,
    EDS
} from '@/models/models';
import {
    GlobalService,
} from '@/app/core';

@Component({
    selector: 'app-asset',
    templateUrl: 'asset.component.html',
    styleUrls: ['asset.component.scss']
})
export class PopupAssetComponent implements OnInit {
    @Input() asset: Balance;
    @Input() index: number;
    @Input() public rateCurrency: string;

    // tslint:disable-next-line:no-output-on-prefix
    @Output() onDelAsset = new EventEmitter < any > ();

    constructor(
        public global: GlobalService,
    ) {}

    ngOnInit(): void {
        this.asset.balance = Number(this.asset.balance);
        if (!this.asset.balance || this.asset.balance === 0) {
            this.asset.rateBalance = 0;
        }
    }

    public fixed(assetId: string) {
        return [NEO, GAS].includes(assetId);
    }

    public delAsset(index: number) {
        this.onDelAsset.emit(index);
    }
}
