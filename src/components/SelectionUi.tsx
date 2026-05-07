import {
  Alert,
  Box,
  Button,
  DateInput,
  FormField,
  LinkButton,
  LoadingIndicator,
  Rows,
  Select,
  SegmentedControl,
  Text,
  Title,
} from "@canva/app-ui-kit";
import type { DateObj } from "@canva/app-ui-kit";
import type {
  DataTableLimit,
  RenderSelectionUiRequest,
} from "@canva/intents/data";
import { useEffect, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  UpApiError,
  UpNetworkError,
  listAccounts,
  listCategories,
  listTags,
} from "../api/up";
import type {
  AccountResource,
  CategoryResource,
  TagResource,
} from "../api/up";
import { clearPat, getPat } from "../auth/patStore";
import {
  decodeSourceRef,
  describeSourceRef,
  encodeSourceRef,
  type SourceRef,
} from "../dataSourceRef";
import { PatSetup } from "./PatSetup";

type Mode = "transactions" | "accounts";

type Props = {
  request: RenderSelectionUiRequest;
};

export function SelectionUi({ request }: Props) {
  const intl = useIntl();
  const [token, setToken] = useState<string | undefined>(() => getPat());

  if (!token) {
    return (
      <PatSetup
        banner={contextBannerMessage(request, intl)}
        onSaved={(t) => setToken(t)}
      />
    );
  }

  return (
    <ConnectedSelection
      key={token}
      token={token}
      request={request}
      onSignOut={() => {
        clearPat();
        setToken(undefined);
      }}
    />
  );
}

function contextBannerMessage(
  request: RenderSelectionUiRequest,
  intl: ReturnType<typeof useIntl>,
): string | undefined {
  const c = request.invocationContext;
  if (c.reason === "outdated_source_ref") {
    return intl.formatMessage({
      defaultMessage:
        "Your previous selection is no longer valid. Pick a new data source.",
      description: "Banner shown when getDataTable returned outdated_source_ref.",
    });
  }
  if (c.reason === "app_error") {
    return (
      c.message ??
      intl.formatMessage({
        defaultMessage:
          "Something went wrong while refreshing. Please reselect your data.",
        description:
          "Generic banner shown when getDataTable returned app_error with no message.",
      })
    );
  }
  return undefined;
}

type ConnectedProps = {
  token: string;
  request: RenderSelectionUiRequest;
  onSignOut: () => void;
};

function ConnectedSelection({ token, request, onSignOut }: ConnectedProps) {
  const intl = useIntl();

  const initialRef = useMemo(() => {
    const c = request.invocationContext;
    if (
      (c.reason === "data_selection" || c.reason === "app_error") &&
      c.dataSourceRef?.source
    ) {
      return decodeSourceRef(c.dataSourceRef.source);
    }
    return null;
  }, [request.invocationContext]);

  const [mode, setMode] = useState<Mode>(
    initialRef?.kind === "accounts" ? "accounts" : "transactions",
  );

  const [accounts, setAccounts] = useState<AccountResource[]>([]);
  const [categories, setCategories] = useState<CategoryResource[]>([]);
  const [tags, setTags] = useState<TagResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenInvalid, setTokenInvalid] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [acc, cats, tg] = await Promise.all([
          listAccounts(token),
          listCategories(token),
          listTags(token),
        ]);
        if (cancelled) return;
        setAccounts(acc);
        setCategories(cats);
        setTags(tg);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof UpApiError && err.status === 401) {
          setTokenInvalid(true);
        } else if (err instanceof UpNetworkError) {
          setLoadError(
            intl.formatMessage({
              defaultMessage:
                "Couldn't reach api.up.com.au. Check your connection and retry.",
            }),
          );
        } else {
          setLoadError(
            err instanceof Error
              ? err.message
              : intl.formatMessage({ defaultMessage: "Failed to load Up data." }),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, intl]);

  if (tokenInvalid) {
    return (
      <PatSetup
        banner={intl.formatMessage({
          defaultMessage:
            "Your Up token was rejected. Generate a new one in the Up app.",
        })}
        onSaved={() => onSignOut()}
      />
    );
  }

  if (loading) {
    return (
      <Box padding="2u" justifyContent="center" display="flex">
        <LoadingIndicator size="medium" />
      </Box>
    );
  }

  if (loadError) {
    return (
      <Box paddingX="3u" paddingY="2u">
        <Rows spacing="2u">
          <Alert tone="critical">{loadError}</Alert>
          <Button variant="secondary" onClick={onSignOut} stretch>
            {intl.formatMessage({ defaultMessage: "Change Up token" })}
          </Button>
        </Rows>
      </Box>
    );
  }

  const banner = contextBannerMessage(request, intl);

  return (
    <Box paddingX="3u" paddingY="2u">
      <Rows spacing="2u">
        <Title size="small">
          <FormattedMessage defaultMessage="Up Bank" />
        </Title>
        {banner ? <Alert tone="warn">{banner}</Alert> : null}
        <SegmentedControl
          options={[
            {
              value: "transactions",
              label: intl.formatMessage({ defaultMessage: "Transactions" }),
            },
            {
              value: "accounts",
              label: intl.formatMessage({ defaultMessage: "Accounts" }),
            },
          ]}
          value={mode}
          onChange={(v) => setMode(v as Mode)}
        />
        {mode === "transactions" ? (
          <TransactionsForm
            accounts={accounts}
            categories={categories}
            tags={tags}
            limit={request.limit}
            initial={
              initialRef?.kind === "transactions" ? initialRef : undefined
            }
            onSubmit={(ref) => submit(ref, request)}
          />
        ) : (
          <AccountsForm
            accountCount={accounts.length}
            limit={request.limit}
            onSubmit={() => submit({ kind: "accounts" }, request)}
          />
        )}
        <Box paddingTop="1u">
          <LinkButton onClick={onSignOut}>
            <FormattedMessage defaultMessage="Change Up token" />
          </LinkButton>
        </Box>
      </Rows>
    </Box>
  );
}

async function submit(
  ref: SourceRef,
  request: RenderSelectionUiRequest,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const payload = {
    source: encodeSourceRef(ref),
    title: describeSourceRef(ref),
  };
  // eslint-disable-next-line no-console
  console.log("[up-bank] updateDataRef ->", payload);
  try {
    const result = await request.updateDataRef(payload);
    // eslint-disable-next-line no-console
    console.log("[up-bank] updateDataRef <-", result);
    if (result.status === "completed") return { ok: true };
    if (result.status === "app_error") {
      return {
        ok: false,
        message: result.message ?? "Couldn't fetch the data.",
      };
    }
    if (result.status === "remote_request_failed") {
      return {
        ok: false,
        message: "Couldn't reach api.up.com.au. Try again in a moment.",
      };
    }
    if (result.status === "outdated_source_ref") {
      return {
        ok: false,
        message: "This data source is no longer valid. Pick again.",
      };
    }
    return { ok: false, message: "Canva couldn't preview the data." };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[up-bank] updateDataRef threw", err);
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Couldn't preview the data.",
    };
  }
}

type TransactionsFormProps = {
  accounts: AccountResource[];
  categories: CategoryResource[];
  tags: TagResource[];
  limit: DataTableLimit;
  initial?: Extract<SourceRef, { kind: "transactions" }>;
  onSubmit: (
    ref: Extract<SourceRef, { kind: "transactions" }>,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

function TransactionsForm({
  accounts,
  categories,
  tags,
  limit,
  initial,
  onSubmit,
}: TransactionsFormProps) {
  const intl = useIntl();
  const [accountId, setAccountId] = useState<string>(initial?.accountId ?? "");
  const [since, setSince] = useState<DateObj | undefined>(
    initial?.since ? isoToDateObj(initial.since) : defaultSince(),
  );
  const [until, setUntil] = useState<DateObj | undefined>(
    initial?.until ? isoToDateObj(initial.until) : defaultUntil(),
  );
  const [status, setStatus] = useState<"" | "HELD" | "SETTLED">(
    initial?.status ?? "",
  );
  const [category, setCategory] = useState<string>(initial?.category ?? "");
  const [tag, setTag] = useState<string>(initial?.tag ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setSubmitting(true);
    setError(null);
    const ref: Extract<SourceRef, { kind: "transactions" }> = {
      kind: "transactions",
    };
    if (accountId) ref.accountId = accountId;
    if (since) ref.since = dateObjToRfc3339Start(since);
    if (until) ref.until = dateObjToRfc3339End(until);
    if (status) ref.status = status;
    if (category) ref.category = category;
    if (tag) ref.tag = tag;

    const res = await onSubmit(ref);
    if (!res.ok) setError(res.message);
    setSubmitting(false);
  };

  const today: DateObj = todayDateObj();

  const allAccountsLabel = intl.formatMessage({
    defaultMessage: "All accounts",
  });
  const anyCategoryLabel = intl.formatMessage({
    defaultMessage: "Any category",
  });
  const anyTagLabel = intl.formatMessage({ defaultMessage: "Any tag" });
  const anyStatusLabel = intl.formatMessage({ defaultMessage: "Any" });
  const settledLabel = intl.formatMessage({ defaultMessage: "Settled" });
  const heldLabel = intl.formatMessage({ defaultMessage: "Held" });

  return (
    <Rows spacing="2u">
      <Text size="small">
        <FormattedMessage
          defaultMessage="Imports up to {n} transactions, newest first."
          values={{ n: limit.row.toLocaleString() }}
        />
      </Text>
      <FormField
        label={intl.formatMessage({ defaultMessage: "Account" })}
        description={intl.formatMessage({
          defaultMessage: "Leave empty to include all accounts.",
        })}
        value={accountId}
        control={(props) => (
          <Select<string>
            {...props}
            options={[
              { value: "", label: allAccountsLabel },
              ...accounts.map((a) => ({
                value: a.id,
                label: a.attributes.displayName,
                description: `${a.attributes.accountType} - $${a.attributes.balance.value}`,
              })),
            ]}
            value={accountId}
            onChange={(v) => setAccountId(v)}
          />
        )}
      />
      <FormField<DateObj>
        label={intl.formatMessage({ defaultMessage: "From" })}
        value={since}
        control={() => (
          <DateInput
            mode="date"
            value={since}
            max={until ?? today}
            onChange={(v) => setSince(v)}
            onChangeComplete={(v) => setSince(v)}
            ariaLabel={intl.formatMessage({ defaultMessage: "From date" })}
          />
        )}
      />
      <FormField<DateObj>
        label={intl.formatMessage({ defaultMessage: "To" })}
        value={until}
        control={() => (
          <DateInput
            mode="date"
            value={until}
            min={since}
            max={today}
            onChange={(v) => setUntil(v)}
            onChangeComplete={(v) => setUntil(v)}
            ariaLabel={intl.formatMessage({ defaultMessage: "To date" })}
          />
        )}
      />
      <FormField
        label={intl.formatMessage({ defaultMessage: "Status" })}
        value={status}
        control={() => (
          <SegmentedControl
            options={[
              { value: "", label: anyStatusLabel },
              { value: "SETTLED", label: settledLabel },
              { value: "HELD", label: heldLabel },
            ]}
            value={status}
            onChange={(v) => setStatus(v as "" | "HELD" | "SETTLED")}
          />
        )}
      />
      {categories.length > 0 ? (
        <FormField
          label={intl.formatMessage({ defaultMessage: "Category" })}
          value={category}
          control={(props) => (
            <Select<string>
              {...props}
              options={[
                { value: "", label: anyCategoryLabel },
                ...categories.map((c) => ({
                  value: c.id,
                  label: c.attributes.name,
                  description: c.relationships.parent.data?.id ?? undefined,
                })),
              ]}
              value={category}
              onChange={(v) => setCategory(v)}
              searchable
            />
          )}
        />
      ) : null}
      {tags.length > 0 ? (
        <FormField
          label={intl.formatMessage({ defaultMessage: "Tag" })}
          value={tag}
          control={(props) => (
            <Select<string>
              {...props}
              options={[
                { value: "", label: anyTagLabel },
                ...tags.map((t) => ({ value: t.id, label: t.id })),
              ]}
              value={tag}
              onChange={(v) => setTag(v)}
              searchable
            />
          )}
        />
      ) : null}
      {error ? <Alert tone="critical">{error}</Alert> : null}
      <Button
        variant="primary"
        onClick={handleImport}
        loading={submitting}
        disabled={submitting}
        stretch
      >
        {intl.formatMessage({ defaultMessage: "Preview transactions" })}
      </Button>
    </Rows>
  );
}

type AccountsFormProps = {
  accountCount: number;
  limit: DataTableLimit;
  onSubmit: () => Promise<{ ok: true } | { ok: false; message: string }>;
};

function AccountsForm({ accountCount, limit, onSubmit }: AccountsFormProps) {
  const intl = useIntl();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overLimit = accountCount > limit.row;

  const handleImport = async () => {
    setSubmitting(true);
    setError(null);
    const res = await onSubmit();
    if (!res.ok) setError(res.message);
    setSubmitting(false);
  };

  return (
    <Rows spacing="2u">
      <Text size="small">
        <FormattedMessage defaultMessage="Imports a snapshot of all your Up accounts: name, type, ownership, balance, currency, and creation date." />
      </Text>
      <Text size="small">
        <FormattedMessage
          defaultMessage="You currently have {count, plural, one {# account} other {# accounts}}."
          values={{ count: accountCount }}
        />
      </Text>
      {overLimit ? (
        <Alert tone="warn">
          <FormattedMessage
            defaultMessage="You have more accounts ({count}) than Canva's row limit ({rowLimit}). Only the first {rowLimit} will be imported."
            values={{ count: accountCount, rowLimit: limit.row }}
          />
        </Alert>
      ) : null}
      {error ? <Alert tone="critical">{error}</Alert> : null}
      <Button
        variant="primary"
        onClick={handleImport}
        loading={submitting}
        disabled={submitting}
        stretch
      >
        {intl.formatMessage({ defaultMessage: "Import account balances" })}
      </Button>
    </Rows>
  );
}

function jsDateToDateObj(d: Date): DateObj {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function todayDateObj(): DateObj {
  return jsDateToDateObj(new Date());
}

function defaultSince(): DateObj {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return jsDateToDateObj(d);
}

function defaultUntil(): DateObj {
  return todayDateObj();
}

/** Parse a stored RFC-3339 timestamp (or a YYYY-MM-DD prefix) back into a DateObj. */
function isoToDateObj(iso: string): DateObj | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return undefined;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** DateObj -> "YYYY-MM-DDT00:00:00Z" for Up's filter[since]. */
function dateObjToRfc3339Start(d: DateObj): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}T00:00:00Z`;
}

/** DateObj -> "YYYY-MM-DDT23:59:59Z" for Up's filter[until]. */
function dateObjToRfc3339End(d: DateObj): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}T23:59:59Z`;
}
