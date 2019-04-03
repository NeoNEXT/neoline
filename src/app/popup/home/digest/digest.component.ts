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

    ngOnInit(): void {}

    ngOnChanges(changes: SimpleChanges) {
        if (this.assetId) {
            const imageObj = this.assetState.assetFile.get(this.assetId);
            let lastModified = '';
            if (imageObj) {
                lastModified = imageObj['last-modified'];
                this.imageUrl = imageObj['image-src'];
            }
            this.assetState.getAssetSrc(this.assetId, lastModified).subscribe(assetRes => {
                if (assetRes && assetRes['status'] === 200) {
                    this.assetState.setAssetFile(assetRes, this.assetId).then(src => {
                        this.imageUrl = src;
                    });
                } else if (assetRes && assetRes['status'] === 404) {
                    this.imageUrl = this.assetState.defaultAssetSrc;
                }
            });
        }
    }

    public toggleShowTokenName() {
        this.showTokenName = !this.showTokenName;
    }

}
