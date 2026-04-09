import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-json-viewer',
  templateUrl: './json-viewer.component.html',
  styleUrls: ['./json-viewer.component.scss']
})
export class JsonViewerComponent {
  private _data: any;
  objectKeys: string[] = [];

  @Input()
  set data(value: any) {
    this._data = value;
    this.objectKeys = this.isObject(value) ? Object.keys(value) : [];
  }

  get data(): any {
    return this._data;
  }

  isObject(val: any): boolean {
    return val && typeof val === 'object' && !Array.isArray(val);
  }

  isArray(val: any): boolean {
    return Array.isArray(val);
  }

  trackByKey(index: number, key: string): string {
    return key;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
