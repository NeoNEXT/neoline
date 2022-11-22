import { Pipe, PipeTransform } from '@angular/core';
import { bignumber } from 'mathjs';

@Pipe({
  name: 'numberFixed',
})
export class NumberFixedPipe implements PipeTransform {
  public transform(value: any, decimal: number = null) {
    if (!value) {
      return 0;
    }
    if (decimal != null) {
      return bignumber(value).toDP(decimal, 1).toFixed();
    } else {
      return bignumber(value).toFixed();
    }
  }
}
