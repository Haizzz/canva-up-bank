import "@canva/app-ui-kit/styles.css";
import { AppI18nProvider } from "@canva/app-i18n-kit";
import { AppUiProvider } from "@canva/app-ui-kit";
import type {
  DataConnectorIntent,
  GetDataTableRequest,
  GetDataTableResponse,
  RenderSelectionUiRequest,
} from "@canva/intents/data";
import { createRoot } from "react-dom/client";
import {
  UpApiError,
  UpNetworkError,
  listAccounts,
  listTransactions,
} from "../../api/up";
import { getPat } from "../../auth/patStore";
import { SelectionUi } from "../../components/SelectionUi";
import { accountsToTable, transactionsToTable } from "../../data/buildTable";
import { decodeSourceRef } from "../../dataSourceRef";

async function getDataTable(
  request: GetDataTableRequest,
): Promise<GetDataTableResponse> {
  const ref = decodeSourceRef(request.dataSourceRef.source);
  if (!ref) {
    return { status: "outdated_source_ref" };
  }

  const token = getPat();
  if (!token) {
    return {
      status: "app_error",
      message:
        "Sign in: open the Up Bank app and add your Personal Access Token.",
    };
  }

  // Canva's `limit.row` is the count of data rows in DataTable.rows[],
  // not including columnConfigs (header), so we use it directly.
  const dataRowCap = Math.max(0, request.limit.row);
  const columnLimit = request.limit.column;

  // eslint-disable-next-line no-console
  console.log("[up-bank] getDataTable", {
    ref,
    rowCap: dataRowCap,
    columnLimit,
  });

  try {
    if (ref.kind === "accounts") {
      const accounts = await listAccounts(token);
      const limited = accounts.slice(0, dataRowCap);
      return {
        status: "completed",
        dataTable: accountsToTable(limited, columnLimit),
        metadata:
          accounts.length > limited.length
            ? {
                description: `Showing ${limited.length} of ${accounts.length} accounts`,
                providerInfo: { name: "Up", url: "https://up.com.au" },
              }
            : { providerInfo: { name: "Up", url: "https://up.com.au" } },
      };
    }

    // ref.kind === "transactions"
    const accounts = await listAccounts(token);
    const accountsById = new Map(accounts.map((a) => [a.id, a]));

    const { items, truncated } = await listTransactions(
      token,
      {
        accountId: ref.accountId,
        since: ref.since,
        until: ref.until,
        status: ref.status,
        category: ref.category,
        tag: ref.tag,
      },
      dataRowCap,
    );

    // eslint-disable-next-line no-console
    console.log("[up-bank] fetched transactions", {
      count: items.length,
      truncated,
      since: ref.since,
      until: ref.until,
    });

    return {
      status: "completed",
      dataTable: transactionsToTable(items, accountsById, columnLimit),
      metadata: {
        description: truncated
          ? `Showing the first ${items.length.toLocaleString()} transactions (more were available).`
          : `Showing ${items.length.toLocaleString()} transaction${items.length === 1 ? "" : "s"}.`,
        providerInfo: { name: "Up", url: "https://up.com.au" },
      },
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[up-bank] getDataTable error", err);
    if (err instanceof UpApiError) {
      if (err.status === 401) {
        return {
          status: "app_error",
          message:
            "Your Up token was rejected. Open the app to verify it and try again.",
        };
      }
      if (err.status === 404) {
        // The category/tag the user picked may have been removed.
        return { status: "outdated_source_ref" };
      }
      if (err.status >= 500) {
        return { status: "remote_request_failed" };
      }
      return {
        status: "app_error",
        message: `Up API error: ${err.title || err.message}`,
      };
    }
    if (err instanceof UpNetworkError) {
      return { status: "remote_request_failed" };
    }
    return {
      status: "app_error",
      message: err instanceof Error ? err.message : "Unexpected error.",
    };
  }
}

function renderSelectionUi(request: RenderSelectionUiRequest) {
  function render() {
    const root = createRoot(document.getElementById("root") as Element);
    root.render(
      <AppI18nProvider>
        <AppUiProvider>
          <SelectionUi request={request} />
        </AppUiProvider>
      </AppI18nProvider>,
    );
  }

  render();

  if (module.hot) {
    module.hot.accept("../../components/SelectionUi", render);
    module.hot.accept("../../api/up", render);
    module.hot.accept("../../data/buildTable", render);
  }
}

const dataConnector: DataConnectorIntent = {
  getDataTable,
  renderSelectionUi,
};

export default dataConnector;
