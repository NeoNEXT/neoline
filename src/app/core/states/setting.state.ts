import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from '../services/http.service';
import { GlobalService } from '../services/global.service';

@Injectable()
export class SettingState {
    public rateCurrencys = ['USD', 'CNY'];
    constructor(
        private http: HttpService,
        private global: GlobalService
    ) { }
}
