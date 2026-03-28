/**
 * DynamoDB helpers.
 * Uses optimistic locking via a `version` attribute.
 * All mutations must pass the current version; the DB increments it atomically.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.TABLE_NAME || 'BadmintonRooms';
const TTL_SECONDS = 60 * 60 * 24; // 24 hours

const raw = new DynamoDBClient({});
export const db = DynamoDBDocumentClient.from(raw, {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getRoom(code) {
  const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { code } }));
  return Item ?? null;
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createRoom(room) {
  const item = {
    ...room,
    version: 1,
    ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  await db.send(new PutCommand({
    TableName: TABLE,
    Item: item,
    ConditionExpression: 'attribute_not_exists(code)',
  }));
  return item;
}

// ── Generic conditional update (with version increment) ───────────────────────

/**
 * Apply an arbitrary update expression atomically.
 * Fails with a ConditionalCheckFailedException if `version` has changed.
 *
 * @param {string} code - room code (PK)
 * @param {number} expectedVersion
 * @param {string} updateExpr  - e.g. "SET players = :p, #v = #v + :one"
 * @param {object} exprAttrValues - e.g. { ':p': [...], ':one': 1, ':ev': expectedVersion }
 * @param {object} [exprAttrNames] - e.g. { '#v': 'version' }
 * @returns {Promise<object>} - updated attributes
 */
export async function conditionalUpdate(
  code,
  expectedVersion,
  updateExpr,
  exprAttrValues,
  exprAttrNames = {}
) {
  const result = await db.send(new UpdateCommand({
    TableName: TABLE,
    Key: { code },
    UpdateExpression: updateExpr,
    ConditionExpression: '#v = :ev',
    ExpressionAttributeNames: { '#v': 'version', ...exprAttrNames },
    ExpressionAttributeValues: { ':ev': expectedVersion, ':one': 1, ...exprAttrValues },
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes;
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

/** Add a player to the room (pre-start only). */
export async function addPlayer(code, player, expectedVersion) {
  return conditionalUpdate(
    code, expectedVersion,
    'SET players = list_append(players, :p), #v = #v + :one, #ttl = :ttl',
    { ':p': [player], ':ttl': Math.floor(Date.now() / 1000) + TTL_SECONDS },
    { '#ttl': 'ttl' }
  );
}

/** Update format choice (pre-start). */
export async function setFormat(code, format, expectedVersion) {
  return conditionalUpdate(
    code, expectedVersion,
    'SET #fmt = :f, #v = #v + :one',
    { ':f': format },
    { '#fmt': 'format' }
  );
}

/** Persist the generated match schedule and mark session as started. */
export async function startSession(code, matches, expectedVersion) {
  return conditionalUpdate(
    code, expectedVersion,
    'SET matches = :m, currentMatchIndex = :zero, started = :true, #v = #v + :one',
    { ':m': matches, ':zero': 0, ':true': true }
  );
}

/**
 * Mark the active match as done and activate the next one.
 * Also updates player gamesPlayed counts.
 *
 * @param {string} code
 * @param {number} matchIndex - index of the match being completed
 * @param {number} winner - 1 or 2
 * @param {Array} updatedMatches - full match array with status changes applied
 * @param {Array} updatedPlayers - full player array with gamesPlayed incremented
 * @param {number} nextIndex
 * @param {number} expectedVersion
 */
export async function markMatchDone(
  code, matchIndex, winner, updatedMatches, updatedPlayers, nextIndex, expectedVersion
) {
  return conditionalUpdate(
    code, expectedVersion,
    'SET matches = :m, players = :pl, currentMatchIndex = :ni, #v = #v + :one',
    { ':m': updatedMatches, ':pl': updatedPlayers, ':ni': nextIndex }
  );
}

/**
 * Edit the active match and replace all pending matches.
 *
 * @param {string} code
 * @param {Array} updatedMatches - full match array: done + edited-active + new-pending
 * @param {number} expectedVersion
 */
export async function editMatch(code, updatedMatches, expectedVersion) {
  return conditionalUpdate(
    code, expectedVersion,
    'SET matches = :m, #v = #v + :one',
    { ':m': updatedMatches }
  );
}

/** Append additional pending matches to the end of the schedule. */
export async function appendMatches(code, newMatches, expectedVersion) {
  return conditionalUpdate(
    code, expectedVersion,
    'SET matches = list_append(matches, :m), #v = #v + :one',
    { ':m': newMatches }
  );
}
