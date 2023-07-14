import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { tx } from '@cityofzion/neon-core-neo3';
import { AuthType } from '@/models/dapi_neo3';

@Component({
  templateUrl: './dapi-prompt.component.html',
  styleUrls: ['./dapi-prompt.component.scss'],
})
export class PopupDapiPromptComponent {
  scopes: number;
  scopesType: string;
  constructor(@Inject(MAT_DIALOG_DATA) public data) {
    this.scopes = this.data.scopes;
    switch (this.scopes) {
      case tx.WitnessScope.None:
        this.scopesType = AuthType.None;
        break;
      case tx.WitnessScope.CalledByEntry:
        this.scopesType = AuthType.CalledByEntry;
        break;
      case tx.WitnessScope.CustomContracts:
        this.scopesType = AuthType.CustomContracts;
        break;
      case tx.WitnessScope.CustomGroups:
        this.scopesType = AuthType.CustomGroups;
        break;
      case tx.WitnessScope.Global:
        this.scopesType = AuthType.Global;
        break;
      case tx.WitnessScope.WitnessRules:
        this.scopesType = AuthType.WitnessRules;
        break;
    }
  }
}
