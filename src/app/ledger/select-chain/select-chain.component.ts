import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { ChainType, STORAGE_NAME } from '@/app/popup/_lib';
import { ChromeService } from '@/app/core';

@Component({
    selector: 'app-ledger-chain',
    templateUrl: 'select-chain.component.html',
    styleUrls: ['select-chain.component.scss'],
})
export class LedgerChainComponent implements OnInit {
    @Output() selectChain = new EventEmitter<ChainType>();
    chain: ChainType = 'Neo2';
    constructor(private chrome: ChromeService) {}

    ngOnInit(): void {}

    select() {
        this.selectChain.emit(this.chain);
    }

    public async jumbToWeb() {
        let lang = await this.chrome.getStorage(STORAGE_NAME.lang).toPromise();
        if (lang !== 'en') {
            lang = '';
            window.open(
                `https://tutorial.neoline.io/ledgerhardwarewallet`
            );
        } else {
            window.open(
                `https://tutorial.neoline.io/v/1/ledger-hardware-wallet`
            );
        }
    }
}
