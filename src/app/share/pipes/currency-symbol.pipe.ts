import { CurrencyType } from '@/app/popup/_lib/setting';
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencySymbol',
})
export class CurrencySymbolPipe implements PipeTransform {
  public transform(value: CurrencyType) {
    switch (value) {
      case 'CNY':
      case 'JPY':
        return '¥';
      case 'EUR':
        return '€';
      case 'KRW':
        return '₩';
      case 'USD':
      default:
        return '$';
    }
  }
}
