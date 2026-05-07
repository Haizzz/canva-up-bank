import type { TransactionStatus } from "./api/up";

/**
 * Encoded into `DataSourceRef.source` as JSON. Canva persists this verbatim
 * and passes it back to `getDataTable` when the design is refreshed.
 */
export type SourceRef =
  | {
      kind: "transactions";
      accountId?: string;
      since?: string;
      until?: string;
      status?: TransactionStatus;
      category?: string;
      tag?: string;
    }
  | { kind: "accounts" };

export function encodeSourceRef(ref: SourceRef): string {
  return JSON.stringify(ref);
}

export function decodeSourceRef(source: string | undefined): SourceRef | null {
  if (!source) return null;
  try {
    const parsed = JSON.parse(source) as Partial<SourceRef> & {
      kind?: string;
    };
    if (parsed && parsed.kind === "transactions") {
      return {
        kind: "transactions",
        accountId: typeof parsed.accountId === "string" ? parsed.accountId : undefined,
        since: typeof parsed.since === "string" ? parsed.since : undefined,
        until: typeof parsed.until === "string" ? parsed.until : undefined,
        status:
          parsed.status === "HELD" || parsed.status === "SETTLED"
            ? parsed.status
            : undefined,
        category: typeof parsed.category === "string" ? parsed.category : undefined,
        tag: typeof parsed.tag === "string" ? parsed.tag : undefined,
      };
    }
    if (parsed && parsed.kind === "accounts") {
      return { kind: "accounts" };
    }
    return null;
  } catch {
    return null;
  }
}

export function describeSourceRef(ref: SourceRef): string {
  if (ref.kind === "accounts") {
    return "Up account balances";
  }
  const parts: string[] = ["Up transactions"];
  if (ref.since && ref.until) {
    parts.push(`${ref.since.slice(0, 10)} to ${ref.until.slice(0, 10)}`);
  } else if (ref.since) {
    parts.push(`since ${ref.since.slice(0, 10)}`);
  } else if (ref.until) {
    parts.push(`until ${ref.until.slice(0, 10)}`);
  }
  if (ref.status) parts.push(ref.status.toLowerCase());
  if (ref.category) parts.push(`#${ref.category}`);
  if (ref.tag) parts.push(`tag:${ref.tag}`);
  return parts.join(" - ");
}
