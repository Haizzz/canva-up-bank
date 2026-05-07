/**
 * Typed client for the Up Banking API (https://developer.up.com.au).
 *
 * Auth: callers pass the user's Personal Access Token (PAT). It's used as
 * `Authorization: Bearer <token>`.
 *
 * The client is intentionally narrow - it only covers what this app reads.
 */

const API_BASE = "https://api.up.com.au/api/v1";

export type Money = {
  currencyCode: string;
  value: string;
  valueInBaseUnits: number;
};

export type AccountType = "SAVER" | "TRANSACTIONAL" | "HOME_LOAN";
export type OwnershipType = "INDIVIDUAL" | "JOINT";

export type AccountResource = {
  type: "accounts";
  id: string;
  attributes: {
    displayName: string;
    accountType: AccountType;
    ownershipType: OwnershipType;
    balance: Money;
    createdAt: string;
  };
};

export type TransactionStatus = "HELD" | "SETTLED";

export type TransactionResource = {
  type: "transactions";
  id: string;
  attributes: {
    status: TransactionStatus;
    rawText: string | null;
    description: string;
    message: string | null;
    isCategorizable: boolean;
    holdInfo: { amount: Money; foreignAmount: Money | null } | null;
    amount: Money;
    foreignAmount: Money | null;
    settledAt: string | null;
    createdAt: string;
    transactionType: string | null;
  };
  relationships: {
    account: { data: { type: "accounts"; id: string } };
    transferAccount: { data: { type: "accounts"; id: string } | null };
    category: { data: { type: "categories"; id: string } | null };
    parentCategory: { data: { type: "categories"; id: string } | null };
    tags: { data: { type: "tags"; id: string }[] };
  };
};

export type CategoryResource = {
  type: "categories";
  id: string;
  attributes: { name: string };
  relationships: {
    parent: { data: { type: "categories"; id: string } | null };
  };
};

export type TagResource = {
  type: "tags";
  id: string;
};

export type Page<T> = {
  data: T[];
  links: { prev: string | null; next: string | null };
};

export type TransactionFilters = {
  accountId?: string;
  since?: string;
  until?: string;
  status?: TransactionStatus;
  category?: string;
  tag?: string;
};

export class UpApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    message: string,
  ) {
    super(message);
    this.name = "UpApiError";
  }
}

export class UpNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpNetworkError";
  }
}

async function request<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new UpNetworkError(
      err instanceof Error ? err.message : "Network request failed",
    );
  }

  if (!res.ok) {
    let title = res.statusText;
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const first = body?.errors?.[0];
      if (first) {
        title = first.title ?? title;
        detail = first.detail ?? detail;
      }
    } catch {
      // ignore body parse errors
    }
    throw new UpApiError(res.status, title, detail);
  }

  return res.json() as Promise<T>;
}

async function requestAbsolute<T>(url: string, token: string): Promise<T> {
  const path = url.startsWith(API_BASE) ? url.slice(API_BASE.length) : url;
  return request<T>(path, token);
}

export async function ping(token: string): Promise<void> {
  await request<{ meta: { id: string } }>("/util/ping", token);
}

export async function listAccounts(token: string): Promise<AccountResource[]> {
  const items: AccountResource[] = [];
  let page = await request<Page<AccountResource>>(
    "/accounts?page[size]=100",
    token,
  );
  items.push(...page.data);
  while (page.links.next) {
    page = await requestAbsolute<Page<AccountResource>>(page.links.next, token);
    items.push(...page.data);
  }
  return items;
}

export async function listCategories(
  token: string,
): Promise<CategoryResource[]> {
  const res = await request<{ data: CategoryResource[] }>(
    "/categories",
    token,
  );
  return res.data;
}

export async function listTags(token: string): Promise<TagResource[]> {
  const items: TagResource[] = [];
  let page = await request<Page<TagResource>>("/tags?page[size]=100", token);
  items.push(...page.data);
  while (page.links.next) {
    page = await requestAbsolute<Page<TagResource>>(page.links.next, token);
    items.push(...page.data);
  }
  return items;
}

function buildTransactionsPath(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  params.set("page[size]", "100");
  if (filters.since) params.set("filter[since]", filters.since);
  if (filters.until) params.set("filter[until]", filters.until);
  if (filters.status) params.set("filter[status]", filters.status);
  if (filters.category) params.set("filter[category]", filters.category);
  if (filters.tag) params.set("filter[tag]", filters.tag);
  const base = filters.accountId
    ? `/accounts/${encodeURIComponent(filters.accountId)}/transactions`
    : "/transactions";
  return `${base}?${params.toString()}`;
}

/**
 * Fetch transactions, paginating up to `cap` rows. Returns up to `cap` items
 * plus a flag indicating whether more pages were available beyond the cap.
 */
export async function listTransactions(
  token: string,
  filters: TransactionFilters,
  cap: number,
): Promise<{ items: TransactionResource[]; truncated: boolean }> {
  if (cap <= 0) return { items: [], truncated: false };

  const items: TransactionResource[] = [];
  let page = await request<Page<TransactionResource>>(
    buildTransactionsPath(filters),
    token,
  );
  items.push(...page.data);

  while (page.links.next && items.length < cap) {
    page = await requestAbsolute<Page<TransactionResource>>(
      page.links.next,
      token,
    );
    items.push(...page.data);
  }

  if (items.length > cap) {
    return { items: items.slice(0, cap), truncated: true };
  }
  return { items, truncated: page.links.next != null };
}
