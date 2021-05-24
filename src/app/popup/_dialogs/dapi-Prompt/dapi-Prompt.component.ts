import { Component, Inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { tx } from '@cityofzion/neon-core-neo3';
import { AuthType } from '@/models/dapi_neo3';


@Component({
  templateUrl: './dapi-Prompt.component.html',
  styleUrls: ['./dapi-Prompt.component.scss']
})
export class PopupDapiPromptComponent implements OnInit {
    scopes: number;
    scopesType: string;
    constructor(
        private router: Router,
        private dialogRef: MatDialogRef<PopupDapiPromptComponent>,
        @Inject(MAT_DIALOG_DATA) public data
    ) {
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
        }
     }

    ngOnInit(): void {
    }

    public close() {
        if (this.router.url.match('notification') !== null) {
            window.close();
        }
        this.dialogRef.close()
    }
}
