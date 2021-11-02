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
    public defaultScale = 0;

    constructor(public _el: ElementRef) {}

    @HostListener('input', ['$event']) onInputChange() {
        if (this.scale === undefined) {
            this.scale = this.defaultScale;
        }
        let targetValue = this._el.nativeElement.value;
        const pattern = /[^0-9.]/;
        targetValue = targetValue.replace(pattern, '');

        // 输入正整数
        if (this.scale === 0 && targetValue.indexOf('.') >= 0) {
            targetValue = targetValue.replace('.', '');
        }
        // 超出小数位数
        const decimal = targetValue.split('.');
        if (decimal.length > 1 && String(decimal[1]).length > this.scale) {
            const index = targetValue.indexOf('.');
            targetValue = targetValue.slice(0, index + this.scale + 1);
        }
        this._el.nativeElement.value = targetValue;
    }

}
