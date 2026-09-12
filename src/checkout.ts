import { PATHS } from "./config.ts";
import { otherRepo, type ParsedPr } from "./pr-url.ts";

export type CheckoutPlan = {
  pr: { repo: string; dest: string; ref: string };
  other: { repo: string; dest: string; ref: "staging" };
  forbiddenRoot: string;
  mergeIntoStaging: false;
  startApiWebOnFailure: false;
};

export function checkoutPlan(pr: ParsedPr): CheckoutPlan {
  const other = otherRepo(pr.repo);
  return {
    pr: {
      repo: `agribeacon/${pr.repo}`,
      dest: `${PATHS.checkouts}/${pr.repo}`,
      ref: `pull/${pr.number}/head`,
    },
    other: {
      repo: `agribeacon/${other}`,
      dest: `${PATHS.checkouts}/${other}`,
      ref: "staging",
    },
    forbiddenRoot: PATHS.agribeaconWs,
    mergeIntoStaging: false,
    startApiWebOnFailure: false,
  };
}
