export const APP_NAME = 'VCC';
export const APP_FULL_NAME = 'Virtual Card Combat';
export const APP_VERSION = '1.0.0';

export const RATING_DEFAULT = 1000;
export const RATING_K_FACTOR = 32;

export const WS_EVENTS = {
  MATCH_JOIN: 'match:join',
  MATCH_LEAVE: 'match:leave',
  MATCH_STATE: 'match:state',
  MATCH_ACTION: 'match:action',
  MATCH_RESULT: 'match:result',
  QUEUE_JOIN: 'queue:join',
  QUEUE_LEAVE: 'queue:leave',
  QUEUE_MATCHED: 'queue:matched',
  ERROR: 'error',
} as const;

export const BOT_COMMANDS = {
  START: 'start',
  LINK: 'link',
  PLAY: 'play',
  DECK: 'deck',
  STATS: 'stats',
  LEADERBOARD: 'leaderboard',
  HELP: 'help',
} as const;
