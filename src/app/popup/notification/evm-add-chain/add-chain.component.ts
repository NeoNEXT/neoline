import { Component, OnInit } from '@angular/core';
import { ChromeService } from '@/app/core';
import { ActivatedRoute } from '@angular/router';
import { ERRORS } from '@/models/dapi';
import { requestTargetEVM } from '@/models/evm';

@Component({
  templateUrl: './add-chain.component.html',
  styleUrls: ['./add-chain.component.scss'],
})
export class PopupEvmAddChainComponent implements OnInit {
  private messageID = '';
  queryParams = {};

  constructor(private chrome: ChromeService, private aRouter: ActivatedRoute) {
    this.aRouter.queryParams.subscribe((params: any) => {
      this.queryParams = params;
      this.messageID = params.messageID;
    });
  }

  ngOnInit() {
    window.onbeforeunload = () => {
      this.chrome.windowCallback({
        error: ERRORS.CANCELLED,
        ID: this.messageID,
        return: requestTargetEVM.request,
      });
    };
  }
}
