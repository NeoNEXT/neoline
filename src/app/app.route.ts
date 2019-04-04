import {
    NgModule
} from '@angular/core';
import {
    HashLocationStrategy,
    LocationStrategy
} from '@angular/common';
import {
    Routes,
    RouterModule
} from '@angular/router';
import {
    HomeComponent
} from './home/home.component';
import {
    LoginComponent
} from './login/login.component';
import { WalletGuard } from '@app/core';
import { LoginGuard } from './core/guards/wallet.guard';

const routes: Routes = [
    {
        path: 'home',
        component: HomeComponent,
        canActivate: [WalletGuard]
    },
    {
        canActivate: [LoginGuard],
        path: 'login',
        component: LoginComponent
    },
    {
        path: '',
        redirectTo: 'asset',
        pathMatch: 'full'
    }
];

@NgModule({
    imports: [RouterModule.forRoot(routes, {
        onSameUrlNavigation: 'reload'
    })],
    exports: [RouterModule],
    providers: [{
        provide: LocationStrategy,
        useClass: HashLocationStrategy
    }]
})
export class AppRoutingModule {}
