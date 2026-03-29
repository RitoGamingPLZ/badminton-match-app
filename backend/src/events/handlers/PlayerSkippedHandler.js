import { BaseEventHandler } from '../BaseEventHandler.js';

export class PlayerSkippedHandler extends BaseEventHandler {
  apply(state, event) {
    const nextQueue = state.queue.filter(p => p.id !== event.playerId);

    return {
      ...state,
      queue: nextQueue,
    };
  }
}
