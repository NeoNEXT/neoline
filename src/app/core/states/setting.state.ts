import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';

@Injectable()
export class SettingState {
    constructor(
        private http: HttpService,
        private global: GlobalService
    ) { }

    public getRateChannels(): Observable < any > {
        return this.http.get(`${this.global.apiDomain}/v1/settings/getratechannels`);
    }
}
