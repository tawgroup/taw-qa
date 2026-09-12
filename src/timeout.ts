import { RUN_TIMEOUT_MS } from "./config.ts";

export { RUN_TIMEOUT_MS };

export const STOP_ON_TIMEOUT = ["api", "web"] as const;
export const KEEP_VOLUMES = ["taw-qa-mongo", "taw-qa-agent-claude"] as const;

export function onTimeout(): {
  result: "FAIL";
  error: "timeout";
  stopServices: readonly ["api", "web"];
  keepVolumes: readonly ["taw-qa-mongo", "taw-qa-agent-claude"];
} {
  return {
    result: "FAIL",
    error: "timeout",
    stopServices: STOP_ON_TIMEOUT,
    keepVolumes: KEEP_VOLUMES,
  };
}

export function teardownStopServices(): readonly ["api", "web"] {
  return STOP_ON_TIMEOUT;
}
