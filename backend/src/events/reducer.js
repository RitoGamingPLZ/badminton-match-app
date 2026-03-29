class MatchCompletedHandler {
  apply(state, event) {
    return {
      ...state,
      matches: updateMatches(state, event),
      players: updatePlayers(state, event)
    };
  }
}

const handlers = {
  MATCH_COMPLETED: new MatchCompletedHandler()
};

export function reduce(state, event) {
  const handler = handlers[event.type];
  if (!handler) return state;
  return handler.apply(state, event);
}
