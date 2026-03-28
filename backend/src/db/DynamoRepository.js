/**
 * DynamoDB implementation of the room repository.
 *
 * Uses optimistic locking via a `version` attribute and DynamoDB
 * ConditionExpression.  All conflict errors are normalised to
 * VersionConflictError so the handler stays database-agnostic.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { VersionConflictError } from './errors.js';

const TTL_SECONDS = 60 * 60 * 24; // 24 hours

export class DynamoRepository {
  constructor() {
    const clientConfig = {};

    // Allow overriding the endpoint for DynamoDB Local
    if (process.env.DYNAMODB_ENDPOINT) {
      clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
      clientConfig.region   = process.env.AWS_REGION || 'us-east-1';
      clientConfig.credentials = {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID     || 'local',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local',
      };
    }

    this.table = process.env.TABLE_NAME || 'BadmintonRooms';
    this.db    = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async getRoom(code) {
    const { Item } = await this.db.send(
      new GetCommand({ TableName: this.table, Key: { code } })
    );
    return Item ?? null;
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  async createRoom(room) {
    const item = {
      ...room,
      version: 1,
      ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    };
    await this.db.send(new PutCommand({
      TableName:           this.table,
      Item:                item,
      ConditionExpression: 'attribute_not_exists(code)',
    }));
    return item;
  }

  // ── Generic conditional update ──────────────────────────────────────────────

  async #conditionalUpdate(code, expectedVersion, updateExpr, exprAttrValues, exprAttrNames = {}) {
    try {
      const result = await this.db.send(new UpdateCommand({
        TableName:                 this.table,
        Key:                       { code },
        UpdateExpression:          updateExpr,
        ConditionExpression:       '#v = :ev',
        ExpressionAttributeNames:  { '#v': 'version', ...exprAttrNames },
        ExpressionAttributeValues: { ':ev': expectedVersion, ':one': 1, ...exprAttrValues },
        ReturnValues:              'ALL_NEW',
      }));
      return result.Attributes;
    } catch (e) {
      if (e.name === 'ConditionalCheckFailedException') throw new VersionConflictError();
      throw e;
    }
  }

  // ── Full-state save ─────────────────────────────────────────────────────────

  async saveState(code, patch, expectedVersion) {
    const setExprs = [];
    const vals = {};

    if (patch.matches !== undefined)           { setExprs.push('matches = :m');            vals[':m']  = patch.matches; }
    if (patch.players !== undefined)           { setExprs.push('players = :pl');           vals[':pl'] = patch.players; }
    if (patch.currentMatchIndex !== undefined) { setExprs.push('currentMatchIndex = :ci'); vals[':ci'] = patch.currentMatchIndex; }
    if (patch.undoStack !== undefined)         { setExprs.push('undoStack = :us');         vals[':us'] = patch.undoStack; }
    if (patch.operationLog !== undefined)      { setExprs.push('operationLog = :ol');      vals[':ol'] = patch.operationLog; }

    setExprs.push('#v = #v + :one');

    return this.#conditionalUpdate(code, expectedVersion, `SET ${setExprs.join(', ')}`, vals);
  }

  // ── Convenience wrappers ────────────────────────────────────────────────────

  async addPlayer(code, player, expectedVersion) {
    return this.#conditionalUpdate(
      code, expectedVersion,
      'SET players = list_append(players, :p), #v = #v + :one, #ttl = :ttl',
      { ':p': [player], ':ttl': Math.floor(Date.now() / 1000) + TTL_SECONDS },
      { '#ttl': 'ttl' }
    );
  }

  async setFormat(code, format, expectedVersion) {
    return this.#conditionalUpdate(
      code, expectedVersion,
      'SET #fmt = :f, #v = #v + :one',
      { ':f': format },
      { '#fmt': 'format' }
    );
  }

  async startSession(code, matches, expectedVersion) {
    return this.#conditionalUpdate(
      code, expectedVersion,
      'SET matches = :m, currentMatchIndex = :zero, started = :true, #v = #v + :one',
      { ':m': matches, ':zero': 0, ':true': true }
    );
  }

  async appendMatches(code, newMatches, expectedVersion) {
    return this.#conditionalUpdate(
      code, expectedVersion,
      'SET matches = list_append(matches, :m), #v = #v + :one',
      { ':m': newMatches }
    );
  }
}
