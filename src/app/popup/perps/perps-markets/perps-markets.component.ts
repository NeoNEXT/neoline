import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';

import { PERPS_HOME_URL } from '@popup/_lib/perps';

/**
 * 市场页：在独立的一屏里搜索所有已上架的市场。
 *
 * 首页 tab 展示的是同一个列表，但把搜索交到这里来做，这样一个关键词能用上弹窗的整个高度，
 * 而不是在账户卡下面只剩一行结果的位置。列表本身 —— 排序、翻页、置顶 —— 仍留在
 * `perps-market-list` 里，两个界面渲染的都是它。
 */
@Component({
  selector: 'app-perps-markets',
  templateUrl: 'perps-markets.component.html',
  styleUrls: ['perps-markets.component.scss'],
})
export class PerpsMarketsComponent implements AfterViewInit {
  @ViewChild('search') private searchInput: ElementRef<HTMLInputElement>;

  keyword = '';
  readonly homeUrl = PERPS_HOME_URL;

  /**
   * 来到这里必然是为了搜索，所以输入框自己抢焦点。对于 Angular 在文档加载完成之后才
   * 创建的元素，`autofocus` 属性不会生效。
   */
  ngAfterViewInit() {
    this.searchInput?.nativeElement.focus();
  }
}
