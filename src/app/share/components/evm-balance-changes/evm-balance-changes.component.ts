import { Component, Input } from '@angular/core';
import { EvmEstimatedBalanceChange, SimulationResult } from '@/app/core/utils/evm-simulation';

@Component({
  selector: 'evm-balance-changes',
  templateUrl: './evm-balance-changes.component.html',
  styleUrls: ['./evm-balance-changes.component.scss'],
})
export class EvmBalanceChangesComponent {
  @Input() result: SimulationResult = { status: 'loading', changes: [] };
  /** Fiat currency code (e.g. "USD") shown next to fiat values. */
  @Input() rateCurrency = '';

  get changes(): EvmEstimatedBalanceChange[] {
    return this.result?.changes ?? [];
  }

  // Always render the panel — show a loading placeholder while the simulation
  // is in flight so the user knows a prediction is coming before they sign.
  get loading(): boolean {
    return this.result?.status === 'loading';
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
