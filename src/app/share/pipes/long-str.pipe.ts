import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'longStr',
})
export class LongStrPipe implements PipeTransform {
  public transform(value: string) {
    if (value) {
      return value.slice(0, 6) + '...' + value.slice(-6);
    }
  }
}
