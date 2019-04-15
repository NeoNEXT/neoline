import {
    Directive,
    ElementRef,
    HostListener,
    Input
} from '@angular/core';

@Directive({
    selector: 'input[numbersOnly]'
})
export class NumberDirective {
    @Input() public scale: number;

    constructor(public _el: ElementRef) {}

    @HostListener('input', ['$event']) onInputChange() {
        const initValue = this._el.nativeElement.value;
        // 输入正整数
        if (this.scale === 0 && initValue.indexOf('.') >= 0) {
            this._el.nativeElement.value = initValue.replace('.', '');
        }
        // 超出小数位数
        const decimal = initValue.split('.');
        if (decimal.length > 1 && String(decimal[1]).length > this.scale) {
            const index = initValue.indexOf('.');
            this._el.nativeElement.value = initValue.slice(0, index + this.scale + 1);
        }
    }

}
