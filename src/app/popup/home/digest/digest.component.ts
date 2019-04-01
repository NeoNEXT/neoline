import {
    Component,
    Input,
    OnInit,
    OnChanges,
    SimpleChanges,
} from '@angular/core';
import {
    GlobalService,
    AssetState,
} from '@/app/core';

@Component({
    selector: 'app-digest',
    templateUrl: 'digest.component.html',
    styleUrls: ['digest.component.scss']
})
export class PopupHomeDigestComponent implements OnInit, OnChanges {
    @Input() balance: number;
    @Input() symbol: string;
    @Input() name: string;
    @Input() assetId: string;
    @Input() rateBalance: number;
    @Input() rateCurrency: string;

    public imageUrl: any = '';

    public showTokenName: boolean;

    constructor(
        public global: GlobalService,
        private assetState: AssetState,
    ) {
        this.showTokenName = false;
    }

    ngOnInit(): void { }

    ngOnChanges(changes: SimpleChanges) {
        this.imageUrl = '';
        if (this.assetId) {
            this.assetState.getAssetSrc(this.assetId).subscribe(assetRes => {
                if (typeof assetRes === 'string') {
                    this.imageUrl = assetRes;
                } else {
                    this.assetState.setAssetFile(assetRes, this.assetId).then(src => {
                        this.imageUrl = src;
                    });
                }
            });
        }
    }

    public toggleShowTokenName() {
        this.showTokenName = !this.showTokenName;
    }

}
