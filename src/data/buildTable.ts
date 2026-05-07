import type {
  ColumnConfig,
  DataTable,
  DataTableCell,
  DataTableRow,
  DateDataTableCell,
  NumberDataTableCell,
  StringDataTableCell,
} from "@canva/intents/data";
import type { AccountResource, TransactionResource } from "../api/up";

/**
 * Office Open XML number format. AUD with two decimals; negative values shown
 * red. The locale-specific currency identifier `[$$-en-AU]` renders as `$`.
 */
const AUD_FORMAT = "[$$-en-AU]#,##0.00;[Red][$$-en-AU]-#,##0.00";

function strCell(value: string | null | undefined): StringDataTableCell {
  return { type: "string", value: value == null ? undefined : value };
}

function numCell(value: number, formatting?: string): NumberDataTableCell {
  return formatting
    ? { type: "number", value, metadata: { formatting } }
    : { type: "number", value };
}

function dateCell(iso: string | null | undefined): DateDataTableCell {
  if (!iso) return { type: "date", value: undefined };
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return { type: "date", value: undefined };
  return { type: "date", value: Math.floor(ms / 1000) };
}

/**
 * A column definition together with the function that builds its cell from a
 * row source. Keeping these together makes column trimming preserve the
 * cell/column lockstep without indexed lookups.
 */
type Column<Row> = {
  config: ColumnConfig;
  build: (row: Row) => DataTableCell;
};

function buildTable<Row>(
  rows: Row[],
  columns: Column<Row>[],
  columnLimit: number,
): DataTable {
  const limited = columns.slice(0, Math.max(1, columnLimit));
  const dataRows: DataTableRow[] = rows.map((row) => ({
    cells: limited.map((c) => c.build(row)),
  }));
  return {
    columnConfigs: limited.map((c) => c.config),
    rows: dataRows,
  };
}

type TxnRow = {
  txn: TransactionResource;
  accountName: string;
};

const TXN_COLUMNS: Column<TxnRow>[] = [
  {
    config: { name: "Date", type: "date" },
    build: ({ txn }) => dateCell(txn.attributes.settledAt ?? txn.attributes.createdAt),
  },
  {
    config: { name: "Description", type: "string" },
    build: ({ txn }) => strCell(txn.attributes.description),
  },
  {
    config: { name: "Amount (AUD)", type: "number" },
    build: ({ txn }) => numCell(Number(txn.attributes.amount.value), AUD_FORMAT),
  },
  {
    config: { name: "Status", type: "string" },
    build: ({ txn }) => strCell(txn.attributes.status),
  },
  {
    config: { name: "Category", type: "string" },
    build: ({ txn }) => strCell(txn.relationships.category.data?.id ?? undefined),
  },
  {
    config: { name: "Account", type: "string" },
    build: ({ accountName }) => strCell(accountName),
  },
  {
    config: { name: "Tags", type: "string" },
    build: ({ txn }) => {
      const tags = txn.relationships.tags.data.map((d) => d.id).join(", ");
      return strCell(tags || undefined);
    },
  },
  {
    config: { name: "Message", type: "string" },
    build: ({ txn }) => strCell(txn.attributes.message),
  },
  {
    config: { name: "Foreign Amount", type: "string" },
    build: ({ txn }) => {
      const f = txn.attributes.foreignAmount;
      return strCell(f ? `${f.currencyCode} ${f.value}` : undefined);
    },
  },
];

export function transactionsToTable(
  txns: TransactionResource[],
  accountsById: Map<string, AccountResource>,
  columnLimit: number,
): DataTable {
  const rows: TxnRow[] = txns.map((txn) => {
    const accountId = txn.relationships.account.data.id;
    return {
      txn,
      accountName:
        accountsById.get(accountId)?.attributes.displayName ?? accountId,
    };
  });
  return buildTable(rows, TXN_COLUMNS, columnLimit);
}

const ACCOUNT_COLUMNS: Column<AccountResource>[] = [
  {
    config: { name: "Name", type: "string" },
    build: (a) => strCell(a.attributes.displayName),
  },
  {
    config: { name: "Type", type: "string" },
    build: (a) => strCell(a.attributes.accountType),
  },
  {
    config: { name: "Ownership", type: "string" },
    build: (a) => strCell(a.attributes.ownershipType),
  },
  {
    config: { name: "Balance (AUD)", type: "number" },
    build: (a) => numCell(Number(a.attributes.balance.value), AUD_FORMAT),
  },
  {
    config: { name: "Currency", type: "string" },
    build: (a) => strCell(a.attributes.balance.currencyCode),
  },
  {
    config: { name: "Created at", type: "date" },
    build: (a) => dateCell(a.attributes.createdAt),
  },
];

export function accountsToTable(
  accounts: AccountResource[],
  columnLimit: number,
): DataTable {
  return buildTable(accounts, ACCOUNT_COLUMNS, columnLimit);
}
