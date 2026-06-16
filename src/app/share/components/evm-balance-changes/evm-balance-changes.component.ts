import { Component, Input } from '@angular/core';
import { EvmEstimatedBalanceChange, SimulationResult } from '@/app/core/utils/evm-simulation';

@Component({
  selector: 'evm-balance-changes',
  templateUrl: './evm-balance-changes.component.html',
  styleUrls: ['./evm-balance-changes.component.scss'],
})
export class EvmBalanceChangesComponent {
  @Input() result: SimulationResult = { status: 'loading', changes: [] };

  get changes(): EvmEstimatedBalanceChange[] {
    return this.result?.changes ?? [];
  }

  // Render once we have any resolved outcome; stay hidden only while loading.
  get visible(): boolean {
    return this.result?.status !== 'loading';
  }

  get reverted(): boolean {
    return this.result?.status === 'reverted';
  }

  get unavailable(): boolean {
    return this.result?.status === 'unavailable';
  }

  get noChanges(): boolean {
    return this.result?.status === 'success' && this.changes.length === 0;
  }
}
