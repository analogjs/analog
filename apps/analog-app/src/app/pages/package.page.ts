import { Component } from '@angular/core';
import { MyPackage } from 'my-package';

@Component({
  imports: [MyPackage],
  template: ` <lib-my-package /> `,
})
export default class PackagePageComponent {}
