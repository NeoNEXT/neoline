import { Injectable } from '@angular/core';
import { ChainType } from '@popup/_lib';

@Injectable()
export class SelectChainState {
  selectedChainType: ChainType = 'Neo3';

  constructor() {}

  selectChainType(chain: ChainType) {
    this.selectedChainType = chain;
  }
}
