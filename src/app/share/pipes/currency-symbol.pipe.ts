import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'currencySymbol'
})
export class CurrencySymbolPipe implements PipeTransform {
    public transform(value: string) {
        switch (value) {
            case 'cny':
                return '¥';
            case 'usd':
                return '$';
        }
    }
}
