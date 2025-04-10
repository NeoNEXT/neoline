import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'nav',
  templateUrl: 'nav.component.html',
  styleUrls: ['nav.component.scss'],
})
export class NavComponent {
  @Input() title: string;
  @Input() backUrl: string;
  @Input() needTranslate?: boolean = true;
  @Input() customBack?: boolean = false;
  @Output() backEvent = new EventEmitter();

  constructor(private router: Router) {}

  back() {
    this.backEvent.emit();
    if (this.customBack) {
      return;
    } else if (this.backUrl) {
      this.router.navigateByUrl(this.backUrl);
    } else {
      history.go(-1);
    }
  }
}
