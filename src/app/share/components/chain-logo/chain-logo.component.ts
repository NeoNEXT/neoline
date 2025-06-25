import { CHAIN_ICON_MAP, RpcNetwork } from '@/app/popup/_lib';
import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'chain-logo',
  templateUrl: 'chain-logo.component.html',
  styleUrls: ['chain-logo.component.scss'],
})
export class ChainLogoComponent implements OnInit {
  @Input() network?: RpcNetwork;
  hasIcon = false;
  iconUrl = '';

  constructor() {}

  ngOnInit() {
    this.getChainIcon();
  }

  getChainIcon() {
    const chainId = this.network.chainId;
    if (CHAIN_ICON_MAP[chainId]) {
      this.hasIcon = true;
      this.iconUrl = CHAIN_ICON_MAP[chainId];
    } else {
      this.hasIcon = false;
      this.iconUrl = '';
    }
  }
}
