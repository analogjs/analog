import 'zone.js/dist/zone.js';
import { bootstrapApplication } from '@angular/platform-browser';

export default (_element) => {
  return (Component, _props, _childHTML) => {
    bootstrapApplication(Component);
  };
};
