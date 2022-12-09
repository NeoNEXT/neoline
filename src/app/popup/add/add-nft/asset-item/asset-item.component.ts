import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { NftAsset } from '@/models/models';
import { GlobalService } from '@/app/core';

@Component({
  selector: 'app-asset-item',
  templateUrl: './asset-item.component.html',
  styleUrls: ['../../asset-item.scss'],
})
export class PopupAssetItemComponent implements OnInit {
  @Input() asset: NftAsset;

  // tslint:disable-next-line:no-output-on-prefix
  @Output() onAddAsset = new EventEmitter<any>();

  constructor(public global: GlobalService) {}

  ngOnInit(): void {}

  public addAsset() {
    this.onAddAsset.emit();
  }
}
