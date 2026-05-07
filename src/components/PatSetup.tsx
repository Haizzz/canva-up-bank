import {
  Alert,
  Box,
  Button,
  FormField,
  Link,
  MultilineInput,
  Rows,
  Text,
  Title,
} from "@canva/app-ui-kit";
import { requestOpenExternalUrl } from "@canva/platform";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { ping, UpApiError, UpNetworkError } from "../api/up";
import { setPat } from "../auth/patStore";

type Props = {
  /** Optional banner to show above the form (e.g. "Your token expired"). */
  banner?: string;
  /** Called once a token has been verified and saved. */
  onSaved: (token: string) => void;
};

export function PatSetup({ banner, onSaved }: Props) {
  const intl = useIntl();
  const [token, setToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setError(
        intl.formatMessage({
          defaultMessage: "Paste your Personal Access Token first.",
          description: "Error when the user clicks Verify with no token typed.",
        }),
      );
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      await ping(trimmed);
      setPat(trimmed);
      onSaved(trimmed);
    } catch (err) {
      if (err instanceof UpApiError && err.status === 401) {
        setError(
          intl.formatMessage({
            defaultMessage: "Token rejected. Generate a new one in the Up app.",
            description: "Error when the Up API returns 401 Unauthorized.",
          }),
        );
      } else if (err instanceof UpNetworkError) {
        setError(
          intl.formatMessage({
            defaultMessage:
              "Couldn't reach api.up.com.au. Check your connection and retry.",
            description: "Error when the network call to Up failed.",
          }),
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          intl.formatMessage({ defaultMessage: "Something went wrong." }),
        );
      }
    } finally {
      setVerifying(false);
    }
  };

  const openUpApiPage = () => {
    void requestOpenExternalUrl({ url: "https://api.up.com.au" });
  };

  return (
    <Box paddingX="3u" paddingY="2u">
      <Rows spacing="2u">
        <Title size="small">
          <FormattedMessage defaultMessage="Connect your Up account" />
        </Title>
      <Text size="small">
        <FormattedMessage
          defaultMessage="This app reads your Up data using a {link}. The token stays in your browser's local storage and is sent directly to api.up.com.au, never to a third-party server."
          values={{
            link: (
              <Link
                href="https://api.up.com.au"
                requestOpenExternalUrl={openUpApiPage}
              >
                <FormattedMessage defaultMessage="Personal Access Token" />
              </Link>
            ),
          }}
        />
      </Text>
      <Text size="small">
        <FormattedMessage
          defaultMessage="To get a token: open the Up app on your phone, swipe right, tap {a}, then {b}, then {c}."
          values={{
            a: (
              <strong>
                <FormattedMessage defaultMessage="Data sharing" />
              </strong>
            ),
            b: (
              <strong>
                <FormattedMessage defaultMessage="Personal Access Token" />
              </strong>
            ),
            c: (
              <strong>
                <FormattedMessage defaultMessage="Generate a token" />
              </strong>
            ),
          }}
        />
      </Text>
      {banner ? <Alert tone="warn">{banner}</Alert> : null}
      <FormField
        label={intl.formatMessage({ defaultMessage: "Personal Access Token" })}
        description={intl.formatMessage({
          defaultMessage: "Starts with up:yeah:",
        })}
        value={token}
        control={(props) => (
          <MultilineInput
            {...props}
            placeholder="up:yeah:..."
            value={token}
            onChange={(value) => {
              setToken(value);
              if (error) setError(null);
            }}
            minRows={2}
            maxRows={4}
            autoGrow
          />
        )}
      />
      {error ? <Alert tone="critical">{error}</Alert> : null}
      <Button
        variant="primary"
        onClick={handleVerify}
        disabled={!token.trim() || verifying}
        loading={verifying}
        stretch
      >
        {intl.formatMessage({ defaultMessage: "Verify and save" })}
      </Button>
      </Rows>
    </Box>
  );
}
