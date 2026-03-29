/**
 * Base class for all room-mutating commands.
 *
 * Subclasses must override execute(room) and return:
 *   {
 *     event:    object  — domain event describing what happened (passed to applyEvent)
 *     logEntry: object  — { type, matchNum, description } appended to operationLog
 *   }
 *
 * State transitions are handled by applyEvent (events/applyEvent.js), not by commands.
 */
export class Command {
  /**
   * @param {object} room - current room state
   * @returns {{ event: object, logEntry: object }}
   */
  execute(room) {  // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name} must implement execute(room)`);
  }
}
