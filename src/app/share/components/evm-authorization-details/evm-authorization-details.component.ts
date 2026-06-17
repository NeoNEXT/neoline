import { Component, Input } from '@angular/core';
import { EvmAuthorizationDetails } from '@/app/core/utils/evm-authorization';

@Component({
  selector: 'evm-authorization-details',
  templateUrl: './evm-authorization-details.component.html',
  styleUrls: ['./evm-authorization-details.component.scss'],
})
export class EvmAuthorizationDetailsComponent {
  @Input() authorizations: EvmAuthorizationDetails[] = [];
  @Input() labelKey = 'Spender';

  get spender(): string | undefined {
    return this.authorizations.find((authorization) => authorization.spender)
      ?.spender;
  }
}
