import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';

import { PERPS_HOME_URL } from '@popup/_lib/perps';

/**
 * The markets page: search across every listed market, on its own screen.
 *
 * The home tab shows the same list but hands searching over here, so a keyword
 * gets the full popup height instead of one row's worth of results under the
 * account card. The list itself — order, paging, pinning — stays in
 * `perps-market-list`, which both surfaces render.
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
   * Arriving here is always a decision to search, so the field takes focus
   * itself. The `autofocus` attribute does not fire for an element Angular
   * creates after the document has loaded.
   */
  ngAfterViewInit() {
    this.searchInput?.nativeElement.focus();
  }
}
