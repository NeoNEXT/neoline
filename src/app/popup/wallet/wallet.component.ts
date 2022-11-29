import { Component, OnInit } from '@angular/core';

type TabType = 'create' | 'import';
@Component({
  templateUrl: 'wallet.component.html',
  styleUrls: ['wallet.component.scss'],
})
export class PopupWalletComponent implements OnInit {
  tabType: TabType = 'import';

  constructor() {}

  ngOnInit(): void {}
}
