import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'nftTokenId',
})
export class NftTokenIdPipe implements PipeTransform {
  public transform(value: string) {
    if (value && value.length > 12) {
      return value.slice(0, 6) + '...';
    }
    return value ? value : '-';
  }
}
