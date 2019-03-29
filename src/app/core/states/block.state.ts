import { Injectable } from '@angular/core';
import { Subject, Observable, of } from 'rxjs';
import { HttpService } from '../services/http.service';
import { Block } from '@/models/models';
import { map, refCount, publish, startWith } from 'rxjs/operators';
import { GlobalService } from '../services/global.service';

@Injectable()
export class BlockState {
    private _current: Block;
    private $block: Subject<Block> = new Subject();
    constructor(
    ) { }
    public listen() {
        return this._current ?
            this.$block.pipe(refCount(), publish(), startWith(this._current)) :
            this.$block.pipe(refCount(), publish());
    }
}
