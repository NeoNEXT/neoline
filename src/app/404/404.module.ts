import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CommonModule } from '@angular/common';
import { N404Component } from './404.component';

const routes: Routes = [
    { path: '**', component: N404Component }
];

@NgModule({
    declarations: [N404Component],
    imports: [CommonModule, RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class N404Module {}
