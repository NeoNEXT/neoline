import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { BridgeNetwork, GAS3_CONTRACT, NEO3_CONTRACT } from '../../_lib';
import { MatDialog } from '@angular/material/dialog';
import { PopupBridgeFootnoteDialogComponent } from '../../_dialogs';
import { BridgeService } from '@/app/core';
import { Asset } from '@/models/models';
import { forkJoin } from 'rxjs';

type BridgeProgress = { used: string; total: string; percentage: string };

@Component({
  selector: 'bridge-footnote',
  templateUrl: 'bridge-footnote.component.html',
  styleUrls: ['./bridge-footnote.component.scss'],
})
export class NeoXBridgeFootnoteComponent implements OnInit, OnChanges {
  @Input() currentBridgeNetwork: BridgeNetwork;
  @Input() bridgeAsset: Asset;

  gasProgress: BridgeProgress;
  neoProgress: BridgeProgress;
  private lastValidSymbol: 'GAS' | 'NEO' = 'GAS';

  constructor(
    private bridgeService: BridgeService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.bridgeService
      .getBridgeAssetList(this.currentBridgeNetwork)
      .subscribe((res) => {
        const gasAsset = res.neo3.find((a) => a.asset_id === GAS3_CONTRACT);
        const neoAsset = res.neo3.find((a) => a.asset_id === NEO3_CONTRACT);
        if (!gasAsset || !neoAsset) {
          return;
        }
        forkJoin({
          gas: this.bridgeService.getBridgeProgress(
            this.currentBridgeNetwork,
            gasAsset
          ),
          neo: this.bridgeService.getBridgeProgress(
            this.currentBridgeNetwork,
            neoAsset
          ),
        }).subscribe(({ gas, neo }) => {
          this.gasProgress = gas;
          this.neoProgress = neo;
        });
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    const sym = this.bridgeAsset?.symbol;
    if (sym === 'GAS' || sym === 'NEO') {
      this.lastValidSymbol = sym;
    }
  }

  get currentProgress(): BridgeProgress | undefined {
    return this.lastValidSymbol === 'GAS' ? this.gasProgress : this.neoProgress;
  }

  get currentSymbol(): string {
    return this.lastValidSymbol;
  }

  showModal() {
    this.dialog.open(PopupBridgeFootnoteDialogComponent, {
      panelClass: 'custom-dialog-panel',
      backdropClass: 'custom-dialog-backdrop',
      data: { gas: this.gasProgress, neo: this.neoProgress },
    });
  }
}
