import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'nav',
  templateUrl: 'nav.component.html',
  styleUrls: ['nav.component.scss'],
})
export class NavComponent {
  @Input() title: string;
  @Input() backUrl: string;

  constructor(private router: Router) {}

  back() {
    if (this.backUrl) {
      this.router.navigateByUrl(this.backUrl);
    } else {
      history.go(-1);
    }
  }
}
