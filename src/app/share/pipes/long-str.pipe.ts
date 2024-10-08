import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'longStr',
})
export class LongStrPipe implements PipeTransform {
  public transform(value: string, len = 6) {
    if (!value || value.length <= len * 2) {
      return value;
    }
    if (value) {
      return value.slice(0, len) + '...' + value.slice(-len);
    } else {
      return '-';
    }
  }
}
