export function prTouchesEnv(changedFiles: string[]): boolean {
  return changedFiles.some((f) => {
    const base = f.split("/").pop() ?? f;
    return base === ".env" || base === ".env.example";
  });
}

export type EnvAction = "use-mac" | "ask-operator";

export function envAction(changedFiles: string[]): EnvAction {
  return prTouchesEnv(changedFiles) ? "ask-operator" : "use-mac";
}

export function formatEnvDiff(macContent: string, prContent: string): string {
  const macLines = macContent.split(/\r?\n/);
  const prLines = prContent.split(/\r?\n/);
  const macSet = new Set(macLines);
  const prSet = new Set(prLines);
  const added = prLines.filter((l) => l && !macSet.has(l));
  const removed = macLines.filter((l) => l && !prSet.has(l));
  const parts: string[] = [];
  if (removed.length) parts.push("Mac có, PR không:", ...removed.map((l) => `- ${l}`));
  if (added.length) parts.push("PR có, Mac không:", ...added.map((l) => `+ ${l}`));
  if (parts.length === 0) return "(không khác dòng nào)";
  return parts.join("\n");
}
