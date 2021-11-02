import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Block } from '@/models/models';
import { refCount, publish, startWith } from 'rxjs/operators';

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
