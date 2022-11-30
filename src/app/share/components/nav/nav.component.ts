import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'nav',
  templateUrl: 'nav.component.html',
  styleUrls: ['nav.component.scss'],
})
export class NavComponent {
  @Input() title: string;
  @Input() backUrl = '/popup/home';

  constructor(private router: Router) {}

  back() {
    this.router.navigateByUrl(this.backUrl);
  }
}
