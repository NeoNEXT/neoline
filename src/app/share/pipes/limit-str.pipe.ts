import { Pipe, PipeTransform } from '@angular/core';

@Pipe({name: 'limitStr'})
export class LimitStrPipe implements PipeTransform {
    transform(value: any, limit: number): any {
        if (typeof(value) === 'string') {
            return value.length <= limit ? value : value.substring(0, limit-2)+'...'
        } else {
            return value;
        }
    }
}