import { Component, Input, OnInit } from '@angular/core';
import { BridgeNetwork } from '../../_lib';
import { MatDialog } from '@angular/material/dialog';
import { PopupBridgeFootnoteDialogComponent } from '../../_dialogs';
import { BridgeService } from '@/app/core';

@Component({
  selector: 'bridge-footnote',
  templateUrl: 'bridge-footnote.component.html',
  styleUrls: ['./bridge-footnote.component.scss'],
})
export class NeoXBridgeFootnoteComponent implements OnInit {
  @Input() currentBridgeNetwork: BridgeNetwork;

  bridgeData: { used: string; total: string; percentage: string };

  constructor(
    private bridgeService: BridgeService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.bridgeService
      .getGasBridgeProgress(this.currentBridgeNetwork)
      .subscribe((res) => {
        this.bridgeData = res;
      });
  }

  showModal() {
    this.dialog.open(PopupBridgeFootnoteDialogComponent, {
      panelClass: 'custom-dialog-panel',
      backdropClass: 'custom-dialog-backdrop',
      data: this.bridgeData,
    });
  }
}
