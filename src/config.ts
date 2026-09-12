export const HOST_HOME = "/Users/andie";

export const PATHS = {
  checkouts: `${HOST_HOME}/taw-qa/checkouts`,
  mongoDump: `${HOST_HOME}/taw-qa/mongo`,
  apiEnv: `${HOST_HOME}/agribeacon-ws/sutagrow-api/.env`,
  webEnv: `${HOST_HOME}/agribeacon-ws/sutagrow-web/.env`,
  agribeaconWs: `${HOST_HOME}/agribeacon-ws`,
  claudeSettings: `${HOST_HOME}/.claude/settings.json`,
} as const;

export const GITHUB_OWNER = "agribeacon";
export const REPOS = ["sutagrow-api", "sutagrow-web"] as const;
export type SutagrowRepo = (typeof REPOS)[number];

export const PLANE_BASE_URL = "https://plane.agribeacon.tech";
export const PLANE_WORKSPACE = "agribeacon";
export const PLANE_PROJECT = "AND";
export const PLANE_PROJECT_ID = "9e18da7d-112f-4606-bd49-20cd3130b196";

export const API_PORT = 3005;
export const WEB_PORT = 3002;
export const API_URL = "http://api:3005";
export const WEB_URL = "http://web:3002";

export const RUN_TIMEOUT_MS = 45 * 60 * 1000;
export const GITHUB_COMMENT_MAX = 65_000;
