import { Component } from '@angular/core';
import { MyPackageComponent } from 'my-package';

@Component({
  imports: [MyPackageComponent],
  template: ` <lib-my-package /> `,
})
export default class PackagePageComponent {}
