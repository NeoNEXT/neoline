import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';

import { coinColor, coinLogo } from '../perps.util';

/**
 * 市场的图标，在一处统一解析，好让所有 Perps 界面以同样的方式降级：先用内置资源，
 * 再用 Hyperliquid 的图标 CDN，最后退回字母色块。
 *
 * CDN 在图标缺失时会返回 `200`，内容却是 Hyperliquid 应用的 HTML 外壳，所以降级挂在
 * 图片的 `error` 事件上；没有可供分支判断的状态码。HIP-3 市场和刚上架的币种就会走到这里。
 *
 * 尺寸和字母大小取自宿主元素，把布局的话语权留给各个界面自己：
 * `perps-coin-logo { width: 36px; font-size: 15px; }`。
 */
@Component({
  selector: 'perps-coin-logo',
  templateUrl: 'perps-coin-logo.component.html',
  styleUrls: ['perps-coin-logo.component.scss'],
})
export class PerpsCoinLogoComponent implements OnChanges {
  /**
   * 展示符号。它决定字母色块及其颜色，因此 HIP-3 市场会退回到 SNDK 的 `S`，
   * 而不是它 `xyz:` 前缀里的 `x`。
   */
  @Input() symbol: string;
  /**
   * 协议币种，CDN 就是按它给图标建索引的。默认取展示符号，在标准永续 DEX 上两者是同一个
   * 字符串；HIP-3 的调用方必须显式传入，否则它们的市场会解析到一个 CDN 上并不存在的裸符号。
   */
  @Input() coin: string;

  src = '';
  color = '';
  letter = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.symbol || changes.coin) {
      this.src = coinLogo(this.coin || this.symbol);
      this.color = coinColor(this.symbol);
      this.letter = (this.symbol || '').charAt(0).toUpperCase();
    }
  }

  /** CDN 上没有这个币种的图标；改为显示字母色块。 */
  onLoadError(): void {
    this.src = '';
  }
}
