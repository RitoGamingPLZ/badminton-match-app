/**
 * Base class for all room-mutating commands.
 *
 * Subclasses must override execute(room) and return:
 *   {
 *     patch:    object  — fields to merge into the saved room state
 *     logEntry: object  — { type, matchNum, description } appended to operationLog
 *   }
 */
export class Command {
  /**
   * @param {object} room - current room state
   * @returns {{ patch: object, logEntry: object }}
   */
  execute(room) {  // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name} must implement execute(room)`);
  }
}
