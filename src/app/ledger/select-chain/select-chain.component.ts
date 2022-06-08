import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { ChainType } from '@/app/popup/_lib';

@Component({
    selector: 'app-ledger-chain',
    templateUrl: 'select-chain.component.html',
    styleUrls: ['select-chain.component.scss'],
})
export class LedgerChainComponent implements OnInit {
    @Output() selectChain = new EventEmitter<ChainType>();
    chain: ChainType = 'Neo2';
    constructor() {}

    ngOnInit(): void {}

    select() {
        this.selectChain.emit(this.chain);
    }
}
