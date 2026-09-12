export function hostComposeRunArgs(prUrl: string): string[] {
  return [
    "compose",
    "run",
    "--rm",
    "--no-deps",
    "-e",
    `PR_URL=${prUrl}`,
    "-e",
    "GH_TOKEN",
    "-e",
    "PLANE_API_KEY",
    "agent",
  ];
}

export const FORBIDDEN_BINDS = ["/.claude", "/.ssh", "/.config/gh"] as const;
