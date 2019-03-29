import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';

@Component({
    selector: 'pager',
    templateUrl: 'pager.component.html',
    styleUrls: ['pager.component.scss']
})
export class PagerComponent implements OnInit, OnChanges {
    @Input() public total: number = 0;
    @Input() public page: number = 1;
    @Input() public pages: number = 0;
    @Output() public onPage: EventEmitter<number> = new EventEmitter();
    public list: number[] = [];
    public groupBase: number = 0;
    public maxGroup: number = 1;
    constructor() { }

    ngOnInit(): void { }
    ngOnChanges(changes: SimpleChanges): void {
        const currPage = changes.page && changes.page.currentValue;
        if (currPage >= 0) {
            this.groupBase = Math.ceil(currPage / 5);
        } else {
            this.list = [];
        }
        if (changes.pages && changes.pages.currentValue) {
            this.maxGroup = Math.ceil(changes.pages.currentValue / 5);
            this.resolveList();
        }
    }

    public groupPrev() {
        if (this.groupBase > 1) {
            this.groupBase--;
            this.resolveList();
        }
    }
    public groupNext() {
        if (this.groupBase < this.maxGroup) {
            this.groupBase++;
            this.resolveList();
        }
    }
    public jump(value: number) {
        if (value != this.page) {
            this.onPage.emit(value);
        }
    }
    public prev() {
        if (this.page - 1 >= 1) {
            this.onPage.emit(this.page - 1);
        }
    }
    public next() {
        if (this.page + 1 <= this.pages) {
            this.onPage.emit(this.page + 1);
        }
    }

    private resolveList() {
        this.list = [];
        for (let i = 1; i <= 5; i++) {
            let p = (this.groupBase - 1)*5 + i;
            if (p >= 1 && p <= this.pages) {
                this.list.push(p);
            }
        }
    }
}
