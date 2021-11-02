import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'currentPage'
})
export class LimitPageStringPipe implements PipeTransform {
    public transform(value: number, maxLength: number) {
        if (maxLength > 9 || maxLength < 2) {
            maxLength = 9;
        }

        if (value.toString().length > maxLength) {
            return `${ 10 ** (maxLength - 1) - 1 }+`;
        }

        return value.toString();
    }
}
