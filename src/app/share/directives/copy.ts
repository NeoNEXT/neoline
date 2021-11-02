import { Directive, Input, Output, HostListener, EventEmitter } from '@angular/core';

@Directive({
    selector: 'button[copy]',
})
export class CopyDirective {
    @Input() public copy: string = '';
    @Output() public onCopy: EventEmitter<boolean> = new EventEmitter();
    @HostListener('click', ['$event']) public onclick($event) {
        if (!this.copy || !this.copy.length) {
            console.log('no target to copy');
            return;
        }
        const target = document.getElementById(this.copy) as HTMLInputElement;
        if (!target) {
            console.log('target not found');
            return;
        }
        target.select();
        this.onCopy.emit(document.execCommand('copy'));
    }
}
