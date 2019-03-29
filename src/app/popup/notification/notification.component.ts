import { Component, OnInit } from '@angular/core';
import {
    trigger,
    state,
    style,
    animate,
    transition
} from '@angular/animations';
import {Router} from '@angular/router';

@Component({
    templateUrl: 'notification.component.html',
    styleUrls: ['notification.component.scss']
})

export class PopupNotificationComponent implements OnInit {
    ngOnInit(): void { }
}
