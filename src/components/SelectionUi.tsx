import {
  Alert,
  Box,
  Button,
  DateInput,
  FormField,
  Link,
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
import { requestOpenExternalUrl } from "@canva/platform";
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
              description:
                "Error shown when the initial Up data load (accounts/categories/tags) fails due to network.",
            }),
          );
        } else {
          setLoadError(
            err instanceof Error
              ? err.message
              : intl.formatMessage({
                  defaultMessage: "Failed to load Up data.",
                  description:
                    "Generic error shown when initial Up data load fails for an unknown reason.",
                }),
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
          description:
            "Banner shown when an HTTP 401 is returned during the initial data load, prompting the user to re-enter their token.",
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
            {intl.formatMessage({
              defaultMessage: "Change Up token",
              description:
                "Button to forget the saved Up Personal Access Token and prompt the user to enter a new one.",
            })}
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
          <FormattedMessage
            defaultMessage="Up Bank"
            description="Title of the side panel; the brand name of the Up Banking product."
          />
        </Title>
        {banner ? <Alert tone="warn">{banner}</Alert> : null}
        <SegmentedControl
          options={[
            {
              value: "transactions",
              label: intl.formatMessage({
                defaultMessage: "Transactions",
                description:
                  "Mode toggle option: shows the form for importing a list of transactions.",
              }),
            },
            {
              value: "accounts",
              label: intl.formatMessage({
                defaultMessage: "Accounts",
                description:
                  "Mode toggle option: shows the form for importing account balances.",
              }),
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
            onSignOut={onSignOut}
          />
        ) : (
          <AccountsForm
            accountCount={accounts.length}
            limit={request.limit}
            onSubmit={() => submit({ kind: "accounts" }, request)}
            onSignOut={onSignOut}
          />
        )}
        <RepoFooter />
      </Rows>
    </Box>
  );
}

function RepoFooter() {
  const open = () => {
    void requestOpenExternalUrl({
      url: "https://github.com/Haizzz/canva-up-bank",
    });
  };
  return (
    <Box paddingTop="2u">
      <Text size="xsmall" tone="tertiary" alignment="center">
        <FormattedMessage
          defaultMessage="Unofficial · {link}"
          description="Footer text indicating this is an unofficial app, followed by a link to the source code."
          values={{
            link: (
              <Link
                href="https://github.com/Haizzz/canva-up-bank"
                requestOpenExternalUrl={open}
              >
                github.com/Haizzz/canva-up-bank
              </Link>
            ),
          }}
        />
      </Text>
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
  onSignOut: () => void;
};

function TransactionsForm({
  accounts,
  categories,
  tags,
  limit,
  initial,
  onSubmit,
  onSignOut,
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
    description:
      "Default option in the account selector meaning 'do not filter by account'.",
  });
  const anyCategoryLabel = intl.formatMessage({
    defaultMessage: "Any category",
    description:
      "Default option in the category selector meaning 'do not filter by category'.",
  });
  const anyTagLabel = intl.formatMessage({
    defaultMessage: "Any tag",
    description:
      "Default option in the tag selector meaning 'do not filter by tag'.",
  });
  const anyStatusLabel = intl.formatMessage({
    defaultMessage: "Any",
    description:
      "Status filter option meaning 'include both held and settled transactions'.",
  });
  const settledLabel = intl.formatMessage({
    defaultMessage: "Settled",
    description: "Status filter option for settled (finalized) transactions.",
  });
  const heldLabel = intl.formatMessage({
    defaultMessage: "Held",
    description: "Status filter option for held (pending) transactions.",
  });

  return (
    <Rows spacing="2u">
      <Text size="small">
        <FormattedMessage
          defaultMessage="Imports up to {n} transactions, newest first."
          description="Helper text under the Transactions tab heading explaining the row limit."
          values={{ n: limit.row.toLocaleString() }}
        />
      </Text>
      <FormField
        label={intl.formatMessage({
          defaultMessage: "Account",
          description: "Label for the account selector dropdown.",
        })}
        description={intl.formatMessage({
          defaultMessage: "Leave empty to include all accounts.",
          description: "Hint under the account selector explaining the empty value.",
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
        label={intl.formatMessage({
          defaultMessage: "From",
          description:
            "Label for the start-date picker in the transactions filter form.",
        })}
        value={since}
        control={() => (
          <DateInput
            mode="date"
            value={since}
            max={until ?? today}
            onChange={(v) => setSince(v)}
            onChangeComplete={(v) => setSince(v)}
            ariaLabel={intl.formatMessage({
              defaultMessage: "From date",
              description:
                "Accessibility label for the start-date picker in the transactions filter.",
            })}
          />
        )}
      />
      <FormField<DateObj>
        label={intl.formatMessage({
          defaultMessage: "To",
          description:
            "Label for the end-date picker in the transactions filter form.",
        })}
        value={until}
        control={() => (
          <DateInput
            mode="date"
            value={until}
            min={since}
            max={today}
            onChange={(v) => setUntil(v)}
            onChangeComplete={(v) => setUntil(v)}
            ariaLabel={intl.formatMessage({
              defaultMessage: "To date",
              description:
                "Accessibility label for the end-date picker in the transactions filter.",
            })}
          />
        )}
      />
      <FormField
        label={intl.formatMessage({
          defaultMessage: "Status",
          description:
            "Label for the transaction status segmented control (Any / Settled / Held).",
        })}
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
          label={intl.formatMessage({
            defaultMessage: "Category",
            description:
              "Label for the transaction category selector dropdown.",
          })}
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
          label={intl.formatMessage({
            defaultMessage: "Tag",
            description: "Label for the transaction tag selector dropdown.",
          })}
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
        {intl.formatMessage({
          defaultMessage: "Preview transactions",
          description:
            "Primary button on the Transactions tab; runs the query and previews matching transactions.",
        })}
      </Button>
      <Button
        variant="tertiary"
        onClick={onSignOut}
        disabled={submitting}
        stretch
      >
        {intl.formatMessage({
          defaultMessage: "Change Up token",
          description:
            "Secondary action on the Transactions tab; clears the saved token and returns to the setup screen.",
        })}
      </Button>
    </Rows>
  );
}

type AccountsFormProps = {
  accountCount: number;
  limit: DataTableLimit;
  onSubmit: () => Promise<{ ok: true } | { ok: false; message: string }>;
  onSignOut: () => void;
};

function AccountsForm({
  accountCount,
  limit,
  onSubmit,
  onSignOut,
}: AccountsFormProps) {
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
        <FormattedMessage
          defaultMessage="Imports a snapshot of all your Up accounts: name, type, ownership, balance, currency, and creation date."
          description="Helper text on the Accounts tab describing what columns the import will produce."
        />
      </Text>
      <Text size="small">
        <FormattedMessage
          defaultMessage="You currently have {count, plural, one {# account} other {# accounts}}."
          description="Status line showing how many Up accounts the user has."
          values={{ count: accountCount }}
        />
      </Text>
      {overLimit ? (
        <Alert tone="warn">
          <FormattedMessage
            defaultMessage="You have more accounts ({count}) than Canva's row limit ({rowLimit}). Only the first {rowLimit} will be imported."
            description="Warning shown when the user has more Up accounts than Canva will accept in a single import."
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
        {intl.formatMessage({
          defaultMessage: "Import account balances",
          description:
            "Primary button on the Accounts tab; imports a snapshot of account balances.",
        })}
      </Button>
      <Button
        variant="tertiary"
        onClick={onSignOut}
        disabled={submitting}
        stretch
      >
        {intl.formatMessage({
          defaultMessage: "Change Up token",
          description:
            "Secondary action on the Accounts tab; clears the saved token and returns to the setup screen.",
        })}
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
