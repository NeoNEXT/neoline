import {
    Injectable,
    EventEmitter
} from '@angular/core';

@Injectable()
export class FilterBarService {
    public needLoad: EventEmitter<boolean>;

    constructor() {
        this.needLoad = new EventEmitter<boolean>();
    }
}
