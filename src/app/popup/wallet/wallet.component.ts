import { Component, OnInit } from '@angular/core';
import {
    trigger,
    state,
    style,
    animate,
    transition
} from '@angular/animations';
import {Router} from '@angular/router';
import { NeonService } from '@/app/core';

@Component({
    templateUrl: 'wallet.component.html',
    styleUrls: ['wallet.component.scss'],
    animations: [
        trigger('switchOperateForCreate', [
            state('create', style({
                marginLeft: '0'
            })),
            state('import', style({
                marginLeft: '40px'
            })),
            transition('create => import', [
                animate('0.1s')
            ]),
            transition('import => create', [
                animate('0.1s')
            ]),
        ]),
        trigger('switchOperateForImport', [
            state('create', style({
                marginRight: '40px'
            })),
            state('import', style({
                marginLeft: '0px'
            })),
            transition('create => import', [
                animate('0.1s')
            ]),
            transition('import => create', [
                animate('0.1s')
            ]),
        ])
    ]
})

export class PopupWalletComponent implements OnInit {
    public isCreate = true;
    public createStatus = 'hibernate';
    public importStatus = '';
    public address = '';

    constructor(private router: Router, private neon: NeonService ) {
        this.initOperate(router.url);
        this.address = this.neon.address || '';
    }

    public changeStatus() {
        this.createStatus = this.isCreate ? '' : 'hibernate';
        this.importStatus = !this.isCreate ? '' : 'hibernate';
    }

    public initOperate(url: string) {
        const end = url.indexOf('?');
        if (end !== -1) {
            url = url.slice(0, end);
        }

        const urlParse = url.split('/');
        if (urlParse.length === 3) {
            this.isCreate = true;
            this.createStatus = '';
            this.importStatus = 'hibernate';
        } else {
            this.isCreate = urlParse[3] === 'create';
            this.changeStatus();
        }
    }

    public onOperateChange(isCreate: boolean) {
        this.isCreate = isCreate;
        this.changeStatus();
    }

    ngOnInit(): void { }
}
