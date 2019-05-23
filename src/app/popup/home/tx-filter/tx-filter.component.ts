import {
    Component,
    Input,
    OnInit,
    SimpleChanges,
    OnChanges,
} from '@angular/core';
import { NEO } from '@/models/models';
import { AssetState, NeonService, HttpService, GlobalService, ChromeService } from '@/app/core';
import { TransferService } from '@/app/transfer/transfer.service';

@Component({
    selector: 'app-tx-filter',
    templateUrl: 'tx-filter.component.html',
    styleUrls: ['tx-filter.component.scss', './dark.scss', './light.scss']
})
export class PopupHomeTxFilterComponent implements OnInit, OnChanges {
    @Input() totalCount = 0;
    @Input() totalPage = 0;
    @Input() assetId = '';

    private status = {
        confirmed: 'confirmed',
        estimated: 'estimated',
        success: 'success'
    };

    public NEO = NEO;
    public init = false;

    public imageUrl = '';
    public showClaim = false;
    public claimNumber = 0;
    public claimStatus = 'confirmed';
    public loading = false;
    private claimsData = null;
    private intervalClaim = null;

    constructor(
        private assetState: AssetState,
        private neon: NeonService,
        private http: HttpService,
        private global: GlobalService,
        private transfer: TransferService
    ) { }
    ngOnInit(): void {
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes.assetId !== undefined && changes.assetId.currentValue !== undefined && changes.assetId.currentValue === NEO) {
            if (this.assetId) {
                const imageObj = this.assetState.assetFile.get(this.assetId);
                let lastModified = '';
                if (imageObj) {
                    lastModified = imageObj['last-modified'];
                    this.imageUrl = imageObj['image-src'];
                }
                this.loading = true;
                this.assetState.getAssetSrc(this.assetId, lastModified).subscribe(assetRes => {
                    this.loading = false;
                    if (assetRes && assetRes['status'] === 200) {
                        this.assetState.setAssetFile(assetRes, this.assetId).then(src => {
                            this.imageUrl = src;
                        });
                    } else if (assetRes && assetRes['status'] === 404) {
                        this.imageUrl = this.assetState.defaultAssetSrc;
                    }
                });
            }
            this.initClaim();
        }
    }

    public claim() {
        this.loading = true;
        if (this.claimStatus === this.status.success) {
            this.initClaim();
            return;
        }
        if (this.claimStatus === this.status.estimated) {
            this.syncNow();
            return;
        }
        this.neon.claimGAS(this.claimsData, this.claimNumber).subscribe(tx => {
            return this.http.post(`${this.global.apiDomain}/v1/transactions/transfer`, {
                signature_transaction: tx.serialize(true)
            }).subscribe(res => {
                if (this.intervalClaim === null) {
                    this.initInterval();
                }
            }, err => {
                this.loading = false;
                if (this.intervalClaim === null) {
                    this.initInterval();
                }
            });
        });
    }

    private initInterval() {
        this.intervalClaim = setInterval(() => {
            this.assetState.fetchClaim(this.neon.address).subscribe((claimRes: any) => {
                if (Number(claimRes.unspent_claim) === 0) {
                    this.loading = false;
                    this.claimNumber = claimRes.uncollect_claim;
                    clearInterval(this.intervalClaim);
                    this.intervalClaim = null;
                    this.claimStatus = this.status.success;
                }
            });
        }, 10000);
    }

    private syncNow() {
        this.transfer.create(this.neon.address, this.neon.address, NEO, 1).subscribe((res) => {
            res.sign(this.neon.WIFArr[this.neon.walletArr.findIndex(item =>
                item.accounts[0].address === this.neon.wallet.accounts[0].address)]);
            this.http.post(`${this.global.apiDomain}/v1/transactions/transfer`, {
                signature_transaction: res.serialize(true)
            }).subscribe(txRes => {
                if (this.intervalClaim === null) {
                    this.intervalClaim = setInterval(() => {
                        this.assetState.fetchClaim(this.neon.address).subscribe((claimRes: any) => {
                            if (Number(claimRes.unspent_claim) !== 0) {
                                this.loading = false;
                                this.claimsData = claimRes.claims;
                                this.claimNumber = claimRes.unspent_claim;
                                clearInterval(this.intervalClaim);
                                this.claimStatus = this.status.confirmed;
                                this.intervalClaim = null;
                            }
                        });
                    }, 10000);
                }
            }, txErr => {
                this.loading = false;
            });
        }, (err) => {
            this.global.snackBarTip('wentWrong', err);
        });
    }

    private initClaim() {
        this.assetState.fetchClaim(this.neon.address).subscribe((res: any) => {
            this.claimsData = res.claims;
            if (res.unspent_claim > 0) {
                this.claimNumber = res.unspent_claim;
                this.showClaim = true;
            } else if (res.uncollect_claim > 0) {
                this.claimNumber = res.uncollect_claim;
                this.claimStatus = this.status.estimated;
                this.showClaim = true;
            } else {
                this.showClaim = false;
            }
            this.init = true;
            this.loading = false;
        });
    }
}
