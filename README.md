# YouTube MCP Curator

**Social Curator AI for YouTube · Personal local MCP server · v0.1**

YouTube MCP Curator lets ChatGPT inspect and manage the subscriptions of the Google account you connect. The server runs on your computer, uses Google OAuth 2.0 and the YouTube Data API v3, and stores Google tokens encrypted locally. It does not require a project-hosted backend.

> **Personal, local-first software.** This v0.1 is intended for one user on one computer. It is not a hosted service or a publicly installable ChatGPT app.

## What it can do

| MCP tool | Purpose |
| --- | --- |
| `list_subscriptions` | List a page of subscriptions for the connected YouTube account. Use the returned page token to continue. |
| `search_channels` | Search public YouTube channels. |
| `prepare_subscribe` | Show the exact channel and create a short-lived confirmation token. This tool does not change YouTube. |
| `subscribe` | Subscribe to exactly one channel, after a separate, explicit confirmation and with the matching token. |
| `prepare_unsubscribe` | Show the exact subscription and create a short-lived confirmation token. This tool does not change YouTube. |
| `unsubscribe` | Remove exactly one subscription, after a separate, explicit confirmation and with the matching token. |

Write actions require the matching `prepare_*` call first. The confirmation token is single-use and expires after five minutes. Each write affects one channel; there is no bulk unsubscribe operation. `unsubscribe` requires the **subscription ID** returned by `list_subscriptions`, not a channel ID.

The model can use search results to suggest channels, but v0.1 does not include an automatic recommendation engine.

## Requirements

- A computer with [Node.js 24 or later](https://nodejs.org/).
- A Google Cloud project you control, with **YouTube Data API v3** enabled and a Google OAuth 2.0 web application client.
- An account allowed to test the OAuth application. During Google's **Testing** phase, add your Google account as a test user.
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for direct local testing.
- To connect from ChatGPT: access to custom MCP apps in ChatGPT and OpenAI Secure MCP Tunnel, plus the `tunnel-client` runtime and a tunnel associated with the ChatGPT workspace you will use. **As of October 2026, OpenAI documents full MCP support, including write actions, as a beta for Business, Enterprise, and Edu; Pro users can connect custom MCP servers with read/fetch permissions in developer mode.** Availability and workspace settings can change; see [OpenAI's current availability notes](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).

## 1. Install and configure the server

Clone this repository, open a terminal in the project directory, install dependencies, and create a local environment file:

```sh
npm install
cp .env.example .env
npm run generate-key
```

Create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/):

1. Select your project and enable **YouTube Data API v3**.
2. Configure Google Auth Platform and add your Google account as a test user while the app is in Testing.
3. Create an OAuth client of type **Web application**.
4. Add this exact authorized redirect URI: `http://127.0.0.1:8788/oauth2callback`.
5. Copy the Client ID and Client Secret into the matching fields in `.env`.
6. Put the base64 key printed by `npm run generate-key` into `TOKEN_ENCRYPTION_KEY`.
7. Keep `GOOGLE_REDIRECT_URI` set to `http://127.0.0.1:8788/oauth2callback` unless you also change the Google Cloud redirect URI.

Do not paste credentials into an issue, chat, or GitHub. `.env` is excluded from Git. The Google tokens are stored encrypted in `.data/google-tokens.enc`; keep the encryption key safe and separate because the token file cannot be recovered without it.

Authorize the Google account and start the MCP server:

```sh
npm run auth
npm run dev
```

`npm run auth` opens Google's consent page in your browser and returns to the local callback. Review the requested permissions before granting access. The server listens on `127.0.0.1:8787`; its MCP endpoint is `http://127.0.0.1:8787/mcp`.

In a second terminal, check the server and optionally launch the Inspector:

```sh
curl http://127.0.0.1:8787/health
npm run inspect
```

In MCP Inspector, select **Streamable HTTP**, enter `http://127.0.0.1:8787/mcp`, and connect. Try `list_subscriptions` and `search_channels` before testing any write tool.

## 2. Connect the local server to ChatGPT

ChatGPT cannot call `localhost` on your computer directly. Secure MCP Tunnel lets ChatGPT reach the local MCP endpoint while the server remains private and the tunnel client makes an outbound connection. Keep both the MCP server and `tunnel-client` running whenever you use the ChatGPT app.

### 2.1 Create or select an OpenAI tunnel

1. Open [OpenAI Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels) and select the Platform organization you use.
2. Create a tunnel, or reuse an existing one. Make sure it is associated with **both** the Platform organization and the ChatGPT workspace where you will add the app. A tunnel linked only to a Platform organization may not appear in the ChatGPT picker.
3. Note the tunnel ID (`tunnel_id`). You will also need an OpenAI **runtime API key** for `tunnel-client` and the required Tunnels **Read** and **Use** permissions. Creating or editing a tunnel additionally requires **Manage**. Runtime keys are managed in [OpenAI Platform API keys](https://platform.openai.com/settings/organization/api-keys).
4. Download the current `tunnel-client` from the Platform tunnel page or the [official OpenAI tunnel-client releases](https://github.com/openai/tunnel-client/releases/latest). The CLI changes over time; the commands below use its current profile workflow.

The runtime API key is used by `tunnel-client` to authenticate to the OpenAI tunnel control plane. The YouTube MCP server does not call the OpenAI API. Do not enter this key into `.env`, the ChatGPT app's authentication field, GitHub, or a conversation.

### 2.2 Start the server and configure the tunnel client

Keep the MCP server running in Terminal 1:

```sh
npm run dev
```

In Terminal 2, change to this repository's directory. Check the CLI's built-in setup guidance first:

```sh
tunnel-client help quickstart
tunnel-client help samples
```

This server speaks Streamable HTTP and does not expose MCP OAuth discovery. Its Google OAuth was completed locally in step 1. Use the HTTP, no-MCP-auth profile—not the stdio sample, which requires `--mcp-command`.

Enter your runtime key without echoing it in the terminal, then create and validate a profile. Replace the example tunnel ID with yours:

```zsh
read -s "CONTROL_PLANE_API_KEY?OpenAI tunnel runtime key: "
export CONTROL_PLANE_API_KEY
printf '\n'

tunnel-client init \
  --sample sample_mcp_remote_no_auth \
  --profile youtube-mcp-curator \
  --tunnel-id tunnel_REPLACE_WITH_YOURS \
  --mcp-server-url http://127.0.0.1:8787/mcp

tunnel-client doctor --profile youtube-mcp-curator --explain
tunnel-client run --profile youtube-mcp-curator
```

Leave the final command running. The profile refers to the runtime key through the environment; it should not save the literal key. If your installed binary does not list `sample_mcp_remote_no_auth`, use the Platform's current download and the built-in `help samples` output rather than substituting `sample_mcp_stdio_local`. For an HTTP MCP endpoint, the `--mcp-server-url` option is required.

### 2.3 Add the MCP server in ChatGPT

In ChatGPT on the web, open **Plugins** (some accounts may show **Apps**), select **+**, then **Add custom MCP server**. Fill in the form as follows:

| Field | Value |
| --- | --- |
| Name | `YouTube MCP Curator` |
| Description | `Safely review and manage subscriptions on your connected YouTube account.` |
| Connection | Choose **Tunnel**, then select the tunnel you configured above. Do not enter `http://127.0.0.1:8787/mcp` as a public server URL. |
| Authentication | Choose **No authentication** for the MCP server. Google OAuth is handled separately by the local server; the tunnel runtime key is not entered here. |

Review the risk notice, check **I understand and want to continue**, and select **Create as a plugin**. Install/enable the resulting app if ChatGPT presents that step. Start a new chat, type `@`, and select **YouTube MCP Curator**.

If ChatGPT does not list the tunnel, check that it is associated with the target ChatGPT workspace and that your Platform user has Tunnels Read + Use. The ChatGPT workspace may also require an admin to enable developer mode or custom MCP apps. See [OpenAI's custom MCP server guide](https://developers.openai.com/api/docs/guides/custom-mcp-server) and [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

### 2.4 Try it safely

Start with read-only requests:

```text
Use YouTube MCP Curator to list my YouTube subscriptions.
Use YouTube MCP Curator to search for channels about mathematics.
```

For a write action, ask ChatGPT to prepare it first. Check the exact channel name and then confirm in a separate message. For example:

```text
Prepare a subscription to the exact channel “CHANNEL NAME”. Do not subscribe yet.
```

After ChatGPT shows the channel and asks you to confirm, reply with an explicit confirmation. Only then should it call `subscribe` with the confirmation token and `confirmed: true`. Use the same prepare-then-confirm sequence for `unsubscribe`. ChatGPT may display an additional native approval for a destructive action. If the confirmation token has expired, prepare the action again. A write call affects one channel only.

### Refreshing tools and troubleshooting

- **Connection fails or tool discovery times out:** keep `npm run dev` and `tunnel-client run --profile youtube-mcp-curator` running. Verify `/health`, then run `tunnel-client doctor --profile youtube-mcp-curator --explain`.
- **The HTTP sample says `sample_mcp_stdio_local requires --mcp-command`:** that sample is for stdio. Select `sample_mcp_remote_no_auth` and provide `--mcp-server-url http://127.0.0.1:8787/mcp`.
- **The tunnel is missing from ChatGPT:** associate it with the target ChatGPT workspace and confirm Tunnels Read + Use access.
- **New or changed tools do not appear:** open the app's settings in ChatGPT, select **Refresh**, review the discovered tools, then start a new chat. ChatGPT may keep a snapshot of the tool definitions.
- **Google returns `403` or access denied:** confirm your account is listed as a Google OAuth test user, YouTube Data API v3 is enabled, and the account granted access. Re-run `npm run auth` if authorization was revoked or expired.
- **ChatGPT refuses a write action:** confirm your plan/workspace supports write-enabled MCP apps. Make sure ChatGPT called the matching `prepare_*` tool first, displayed the exact channel, and received your separate confirmation. The server rejects a write without a valid token and `confirmed: true`.

For setup details, see [Google OAuth setup](docs/GOOGLE_SETUP.md) and [security and quota notes](docs/SECURITY_AND_QUOTAS.md). OpenAI's [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) explains workspace associations, permissions, and client diagnostics.

## Security and YouTube API scope

The server binds to loopback (`127.0.0.1`) and stores Google tokens encrypted with AES-256-GCM. Keep `.env`, `.data/`, the OAuth Client Secret, encryption key, and tunnel runtime key private. The confirmation token prevents accidental or unapproved writes but does not replace your review of each channel and action.

Google requires the `youtube.force-ssl` OAuth scope for subscription insertion. That scope is broader than this app's tools: Google describes it as allowing access to and modification of YouTube account data beyond subscriptions. Review Google's consent screen carefully and read [the project's security and quota notes](docs/SECURITY_AND_QUOTAS.md) before authorizing. YouTube Data API requests consume quota units from the project; check current limits and verification requirements in Google Cloud because they can change. See the [YouTube Data API quota documentation](https://developers.google.com/youtube/v3/determine_quota_cost) and [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).

## Development

```sh
npm run typecheck
npm test
```

Useful commands:

```sh
npm run generate-key  # generate a local token-encryption key
npm run auth          # connect or reconnect the Google account
npm run dev           # start the local MCP server
npm run inspect       # launch MCP Inspector
```

## Scope and public release

This version is for personal local use. Connecting it to ChatGPT through Secure MCP Tunnel is for private testing; the tunnel is not a public distribution endpoint. A public app would need a stable public HTTPS MCP endpoint, multi-user OAuth and isolated token storage, privacy and support materials, and applicable reviews from Google and OpenAI. See [the publishing guide](docs/PUBLISHING.md).

## License

The original YouTube MCP Curator code is licensed under the MIT License. Third-party components remain subject to their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
