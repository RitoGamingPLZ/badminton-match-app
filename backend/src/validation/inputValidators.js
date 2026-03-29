/**
 * Validators that check request input (body / params).
 * Each returns { status, error } on failure, or null on success.
 */

export function validatePlayerNameRequired(req) {
  if (!req.body?.playerName?.trim()) return { status: 400, error: 'playerName is required' };
  return null;
}

export function validatePlayerNameNotTaken(req, room) {
  const name = req.body.playerName.trim();
  if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
    return { status: 409, error: 'Name already taken in this room' };
  return null;
}

export function validateWinner(req) {
  const { winner } = req.body;
  if (winner !== 1 && winner !== 2) return { status: 400, error: 'winner must be 1 or 2' };
  return null;
}

export function validateTeams(req) {
  const { team1, team2 } = req.body;
  if (!Array.isArray(team1) || team1.length !== 2)
    return { status: 400, error: 'team1 must have 2 players' };
  if (!Array.isArray(team2) || team2.length !== 2)
    return { status: 400, error: 'team2 must have 2 players' };
  return null;
}

export function validateTeamPlayers(req, room) {
  const { team1, team2 } = req.body;
  const allNames  = new Set(room.players.map(p => p.name));
  const submitted = [...team1, ...team2];
  for (const name of submitted) {
    if (!allNames.has(name)) return { status: 400, error: `Unknown player: ${name}` };
  }
  if (new Set(submitted).size !== submitted.length)
    return { status: 400, error: 'Duplicate players in teams' };
  return null;
}

export function validateMatchExists(matchIndex, room) {
  if (!room.matches[matchIndex])
    return { status: 400, error: `Match index ${matchIndex} does not exist` };
  return null;
}

export function validateMatchEditable(matchIndex, room) {
  const { status } = room.matches[matchIndex];
  if (status === 'done' || status === 'skipped')
    return { status: 409, error: 'Cannot edit a completed or skipped match' };
  return null;
}

export function validatePlayerInMatch(playerName, room) {
  const match      = room.matches[room.currentMatchIndex];
  const allPlayers = new Set([...match.team1, ...match.team2]);
  if (!allPlayers.has(playerName))
    return { status: 400, error: `${playerName} is not in the current match` };
  return null;
}
