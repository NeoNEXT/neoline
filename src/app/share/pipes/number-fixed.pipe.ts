import { Pipe, PipeTransform } from '@angular/core';
import { bignumber } from 'mathjs';

@Pipe({
    name: 'numberFixed'
})
export class NumberFixedPipe implements PipeTransform {
    public transform(value: any) {
        return bignumber(value).toFixed();
    }
}
