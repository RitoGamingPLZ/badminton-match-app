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

// ── Full-state save (used by operations that push to undo/log) ────────────────

/**
 * Atomically save a partial room state update.
 * Any field omitted from `patch` is left unchanged in DynamoDB.
 *
 * Supported patch keys: matches, players, currentMatchIndex, undoStack, operationLog
 */
export async function saveState(code, patch, expectedVersion) {
  const setExprs = [];
  const vals = {};

  if (patch.matches !== undefined)           { setExprs.push('matches = :m');            vals[':m']  = patch.matches; }
  if (patch.players !== undefined)           { setExprs.push('players = :pl');           vals[':pl'] = patch.players; }
  if (patch.currentMatchIndex !== undefined) { setExprs.push('currentMatchIndex = :ci'); vals[':ci'] = patch.currentMatchIndex; }
  if (patch.undoStack !== undefined)         { setExprs.push('undoStack = :us');         vals[':us'] = patch.undoStack; }
  if (patch.operationLog !== undefined)      { setExprs.push('operationLog = :ol');      vals[':ol'] = patch.operationLog; }

  setExprs.push('#v = #v + :one');

  return conditionalUpdate(code, expectedVersion, `SET ${setExprs.join(', ')}`, vals);
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

/** Append additional pending matches to the end of the schedule. */
export async function appendMatches(code, newMatches, expectedVersion) {
  return conditionalUpdate(
    code, expectedVersion,
    'SET matches = list_append(matches, :m), #v = #v + :one',
    { ':m': newMatches }
  );
}
