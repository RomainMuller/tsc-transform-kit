import { BaseInterface } from '../bar';

export class Implementation implements BaseInterface {
  public boolProperty: boolean = false;

  public someMethod() {
    this.boolProperty = !this.boolProperty;
  }
}
