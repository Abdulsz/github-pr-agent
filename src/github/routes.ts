import type { Env } from "../types";
import type { FeedbackDB } from "../feedback/db";
import { authenticateRequest, decryptToken } from "../feedback/auth";
import {
  buildGitHubAuthorizeUrl,
  connectAgentWithToken,
  createOAuthState,
  encryptGitHubAccessToken,
  exchangeCodeForToken,
  fetchGitHubUser,
  getOAuthRedirectUri,
  redirectWithStatus,
  verifyOAuthState,
} from "./oauth";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    },
  });
}

export async function handleGitHubRoutes(
  request: Request,
  env: Env,
  pathname: string,
  db: FeedbackDB
): Promise<Response | null> {
  if (
    pathname === "/api/github/oauth/authorize" &&
    (request.method === "GET" || request.method === "POST")
  ) {
    return handleAuthorize(request, env, db);
  }

  if (pathname === "/api/github/oauth/callback" && request.method === "GET") {
    return handleCallback(request, env, db);
  }

  if (pathname === "/api/github/oauth/status" && request.method === "GET") {
    return handleStatus(request, env, db);
  }

  if (pathname === "/api/github/oauth/disconnect" && request.method === "DELETE") {
    return handleDisconnect(request, env, db);
  }

  return null;
}

async function handleAuthorize(
  request: Request,
  env: Env,
  db: FeedbackDB
): Promise<Response> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return jsonResponse(
      { success: false, error: "GitHub OAuth is not configured on the server" },
      503
    );
  }

  const url = new URL(request.url);
  let context: "agent" | "dashboard" =
    url.searchParams.get("context") === "dashboard" ? "dashboard" : "agent";
  let returnTo = url.searchParams.get("returnTo") || (context === "dashboard" ? "/projects" : "/agent");
  let agentName = url.searchParams.get("agentName") || undefined;

  if (request.method === "POST") {
    context = "dashboard" as const;
    try {
      const body = (await request.json()) as { returnTo?: string };
      if (body.returnTo) returnTo = body.returnTo;
    } catch {
      // Use defaults when body is empty
    }
  }

  if (context === "agent" && !agentName) {
    return jsonResponse(
      { success: false, error: "agentName is required for agent OAuth" },
      400
    );
  }

  let userId: string | undefined;
  if (context === "dashboard") {
    const auth = await authenticateRequest(request, env, db);
    if (!auth.ok) return auth.response;
    userId = auth.user.id;
  }

  const state = await createOAuthState(
    {
      context,
      agentName,
      userId,
      returnTo,
    },
    env.JWT_SECRET
  );

  const redirectUri = getOAuthRedirectUri(request);
  const authorizeUrl = buildGitHubAuthorizeUrl(env.GITHUB_CLIENT_ID, redirectUri, state);

  if (context === "dashboard" && request.method === "POST") {
    return jsonResponse({ success: true, data: { url: authorizeUrl } });
  }

  return Response.redirect(authorizeUrl, 302);
}

async function handleCallback(
  request: Request,
  env: Env,
  db: FeedbackDB
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const githubError = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (githubError) {
    return redirectWithStatus("/agent", "error", githubError);
  }

  if (!code || !stateParam) {
    return redirectWithStatus("/agent", "error", "Missing OAuth code or state");
  }

  const state = await verifyOAuthState(stateParam, env.JWT_SECRET);
  if (!state) {
    return redirectWithStatus("/agent", "error", "Invalid or expired OAuth state");
  }

  try {
    const redirectUri = getOAuthRedirectUri(request);
    const tokenData = await exchangeCodeForToken(code, redirectUri, env);
    const githubUser = await fetchGitHubUser(tokenData.access_token);

    if (state.context === "agent" && state.agentName) {
      const result = await connectAgentWithToken(env, state.agentName, tokenData.access_token);
      if (!result.connected) {
        return redirectWithStatus(
          state.returnTo,
          "error",
          result.error || "Failed to connect agent to GitHub"
        );
      }
      return redirectWithStatus(state.returnTo, "connected");
    }

    if (state.context === "dashboard" && state.userId) {
      const encryptedToken = await encryptGitHubAccessToken(
        tokenData.access_token,
        env.JWT_SECRET
      );
      await db.upsertGitHubConnection({
        userId: state.userId,
        accessToken: encryptedToken,
        githubUserId: githubUser.id,
        githubUsername: githubUser.login,
        scopes: tokenData.scope,
      });
      return redirectWithStatus(state.returnTo, "connected");
    }

    return redirectWithStatus(state.returnTo, "error", "Invalid OAuth context");
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub OAuth failed";
    return redirectWithStatus(state.returnTo, "error", message);
  }
}

async function handleStatus(
  request: Request,
  env: Env,
  db: FeedbackDB
): Promise<Response> {
  const auth = await authenticateRequest(request, env, db);
  if (!auth.ok) return auth.response;

  const connection = await db.getGitHubConnection(auth.user.id);
  if (!connection) {
    return jsonResponse({ success: true, data: { connected: false } });
  }

  return jsonResponse({
    success: true,
    data: {
      connected: true,
      username: connection.githubUsername,
      scopes: connection.scopes,
      connectedAt: connection.updatedAt,
    },
  });
}

async function handleDisconnect(
  request: Request,
  env: Env,
  db: FeedbackDB
): Promise<Response> {
  const auth = await authenticateRequest(request, env, db);
  if (!auth.ok) return auth.response;

  await db.deleteGitHubConnection(auth.user.id);
  return jsonResponse({ success: true });
}

export async function getUserGitHubAccessToken(
  userId: string,
  env: Env,
  db: FeedbackDB
): Promise<string | null> {
  const connection = await db.getGitHubConnection(userId);
  if (!connection) return null;

  try {
    return await decryptToken(connection.accessToken, env.JWT_SECRET);
  } catch {
    return null;
  }
}
