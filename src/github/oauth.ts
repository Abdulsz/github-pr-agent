import type { Env } from "../types";
import { encryptToken } from "../feedback/auth";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";
const OAUTH_SCOPES = "repo";
const STATE_TTL_SECONDS = 10 * 60;

export interface GitHubOAuthState {
  nonce: string;
  context: "agent" | "dashboard";
  agentName?: string;
  userId?: string;
  returnTo: string;
  /** Browser origin to redirect back to after OAuth (e.g. localhost:5173 in dev) */
  frontendOrigin?: string;
  exp: number;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface GitHubUserProfile {
  id: number;
  login: string;
  name?: string;
}

function base64UrlEncode(data: string): string {
  return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("X-Forwarded-Host");
  const forwardedProto = request.headers.get("X-Forwarded-Proto");
  if (forwardedHost) {
    const proto = forwardedProto || "https";
    return `${proto}://${forwardedHost}`;
  }

  const host = request.headers.get("Host");
  if (host) {
    const url = new URL(request.url);
    return `${url.protocol}//${host}`;
  }

  return new URL(request.url).origin;
}

/**
 * Resolve the OAuth callback URL. Must match the Authorization callback URL
 * registered in the GitHub OAuth App exactly.
 */
export function getOAuthRedirectUri(request: Request, env?: { GITHUB_OAUTH_CALLBACK_URL?: string }): string {
  if (env?.GITHUB_OAUTH_CALLBACK_URL) {
    return env.GITHUB_OAUTH_CALLBACK_URL;
  }

  const origin = getRequestOrigin(request);
  const parsed = new URL(origin);

  // Vite dev UI runs on :5173 but OAuth callback is registered on wrangler :8787
  if (parsed.hostname === "localhost" && parsed.port === "5173") {
    return "http://localhost:8787/api/github/oauth/callback";
  }

  return `${origin}/api/github/oauth/callback`;
}

export async function createOAuthState(
  state: Omit<GitHubOAuthState, "nonce" | "exp">,
  secret: string
): Promise<string> {
  const payload: GitHubOAuthState = {
    ...state,
    nonce: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSign(encoded, secret);
  return `${encoded}.${signature}`;
}

export async function verifyOAuthState(
  stateParam: string,
  secret: string
): Promise<GitHubOAuthState | null> {
  const parts = stateParam.split(".");
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  const expected = await hmacSign(encoded, secret);
  if (signature.length !== expected.length) return null;

  let diff = 0;
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as GitHubOAuthState;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildGitHubAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    state,
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  env: Env
): Promise<GitHubTokenResponse> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw new Error("GitHub OAuth is not configured");
  }

  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub token exchange failed: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as GitHubTokenResponse & { error?: string };
  if (!data.access_token) {
    throw new Error(data.error || "GitHub did not return an access token");
  }

  return data;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUserProfile> {
  const response = await fetch(`${GITHUB_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "GitHub-PR-Agent-Cloudflare",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch GitHub user: ${response.status} - ${error}`);
  }

  return response.json() as Promise<GitHubUserProfile>;
}

export async function encryptGitHubAccessToken(
  accessToken: string,
  secret: string
): Promise<string> {
  return encryptToken(accessToken, secret);
}

export function redirectWithStatus(
  returnTo: string,
  status: "connected" | "error",
  requestUrl: string,
  message?: string,
  frontendOrigin?: string
): Response {
  const origin = frontendOrigin || new URL(requestUrl).origin;
  const url = new URL(returnTo, origin);
  url.searchParams.set("github", status);
  if (message) url.searchParams.set("message", message);
  return Response.redirect(url.toString(), 302);
}

export async function connectAgentWithToken(
  env: Env,
  agentName: string,
  accessToken: string
): Promise<{ connected: boolean; username?: string; error?: string }> {
  const agentId = env.GitHubPRAgent.idFromName(agentName);
  const stub = env.GitHubPRAgent.get(agentId);

  const response = await stub.fetch(
    new Request("https://agent/setGitHubToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: [accessToken] }),
    })
  );

  return response.json() as Promise<{
    connected: boolean;
    username?: string;
    error?: string;
  }>;
}
