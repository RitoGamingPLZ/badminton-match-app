export class BaseEventHandler {
  // override in subclasses
  apply(state, event) {
    throw new Error('apply() must be implemented');
  }
}
