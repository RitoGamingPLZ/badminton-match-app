/**
 * Shared error types for the repository layer.
 * All repository implementations throw these so the handler stays
 * decoupled from any database-specific error classes.
 */

export class VersionConflictError extends Error {
  constructor() {
    super('Version conflict — reload and retry');
    this.name = 'VersionConflictError';
  }
}
