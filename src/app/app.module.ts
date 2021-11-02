import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app.route';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ShareModule } from './share';
import { PopupModule } from './popup';
import { N404Module } from './404';
import { CoreModule } from './core';
import { PopupNotificationModule } from './popup/notification/notification.module';

@NgModule({
    declarations: [AppComponent],
    imports: [
        BrowserModule,
        AppRoutingModule,
        BrowserAnimationsModule,
        CoreModule,
        ShareModule,
        PopupModule,
        PopupNotificationModule,
        N404Module,
    ],
    providers: [],
    bootstrap: [AppComponent],
    entryComponents: [],
})
export class AppModule {}
