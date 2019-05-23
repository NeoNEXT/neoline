import {
    Component,
    OnInit
} from '@angular/core';
import {
    Router
} from '@angular/router';
import {
    NeonService,
    GlobalService
} from '@/app/core';

declare var QRCode: any;

@Component({
    templateUrl: 'receive.component.html',
    styleUrls: ['receive.component.scss', './light.scss', './dark.scss']
})
export class TransferReceiveComponent implements OnInit {
    public address: string;
    constructor(
        private router: Router,
        private neon: NeonService,
        private global: GlobalService
    ) {}

    ngOnInit(): void {
        this.address = this.neon.address;
        if (QRCode) {
            let qrcode = new QRCode('receive-qrcode', {
                text: this.address,
                width: 200,
                height: 200,
                colorDark: '#333333',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        }
    }

    public close() {
        this.router.navigate([{
            outlets: {
                transfer: null
            }
        }]);
    }
    public copied() {
        this.global.snackBarTip('copied');
    }
}
