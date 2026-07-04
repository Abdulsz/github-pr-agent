import type { Env } from "../types";
import type { FeedbackDB } from "../feedback/db";
import { authenticateRequest, decryptToken, signJWT } from "../feedback/auth";
import {
  buildGitHubAuthorizeUrl,
  connectAgentWithToken,
  createOAuthState,
  encryptGitHubAccessToken,
  exchangeCodeForToken,
  fetchGitHubUser,
  getOAuthRedirectUri,
  redirectWithStatus,
  resolveGitHubEmail,
  verifyOAuthState,
  type GitHubOAuthState,
  type GitHubTokenResponse,
  type GitHubUserProfile,
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
  const contextParam = url.searchParams.get("context");
  let context: "agent" | "dashboard" | "login" =
    contextParam === "dashboard" || contextParam === "login" ? contextParam : "agent";
  let returnTo =
    url.searchParams.get("returnTo") ||
    (context === "dashboard" ? "/projects" : context === "login" ? "/auth" : "/agent");
  let agentName = url.searchParams.get("agentName") || undefined;
  let frontendOrigin = url.searchParams.get("frontendOrigin") || undefined;

  if (request.method === "POST") {
    context = "dashboard" as const;
    try {
      const body = (await request.json()) as { returnTo?: string; frontendOrigin?: string };
      if (body.returnTo) returnTo = body.returnTo;
      if (body.frontendOrigin) frontendOrigin = body.frontendOrigin;
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
      frontendOrigin,
    },
    env.JWT_SECRET
  );

  const redirectUri = getOAuthRedirectUri(request, env);
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

  const redirect = (
    returnTo: string,
    status: "connected" | "error",
    message?: string,
    frontendOrigin?: string
  ) => redirectWithStatus(returnTo, status, request.url, message, frontendOrigin);

  // Verify state first so errors (e.g. the user cancelled on GitHub) return
  // to the page that started the flow instead of always landing on /agent.
  const state = stateParam ? await verifyOAuthState(stateParam, env.JWT_SECRET) : null;

  if (githubError) {
    return redirect(state?.returnTo || "/agent", "error", githubError, state?.frontendOrigin);
  }

  if (!code || !stateParam) {
    return redirect(state?.returnTo || "/agent", "error", "Missing OAuth code or state", state?.frontendOrigin);
  }

  if (!state) {
    return redirect("/agent", "error", "Invalid or expired OAuth state");
  }

  try {
    const redirectUri = getOAuthRedirectUri(request, env);
    const tokenData = await exchangeCodeForToken(code, redirectUri, env);
    const githubUser = await fetchGitHubUser(tokenData.access_token);

    if (state.context === "login") {
      return handleLoginCallback(request, env, db, state, tokenData, githubUser);
    }

    if (state.context === "agent" && state.agentName) {
      const result = await connectAgentWithToken(env, state.agentName, tokenData.access_token);
      if (!result.connected) {
        return redirect(
          state.returnTo,
          "error",
          result.error || "Failed to connect agent to GitHub",
          state.frontendOrigin
        );
      }
      return redirect(state.returnTo, "connected", undefined, state.frontendOrigin);
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
      return redirect(state.returnTo, "connected", undefined, state.frontendOrigin);
    }

    return redirect(state.returnTo, "error", "Invalid OAuth context", state.frontendOrigin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub OAuth failed";
    return redirect(state.returnTo, "error", message, state.frontendOrigin);
  }
}

/**
 * GitHub sign-in for the dashboard itself: find or create the dashboard user
 * from the GitHub profile, store the OAuth token as their GitHub connection
 * (so auto-PR works without a second sign-in), and hand the session JWT back
 * to the SPA in the URL fragment.
 */
async function handleLoginCallback(
  request: Request,
  env: Env,
  db: FeedbackDB,
  state: GitHubOAuthState,
  tokenData: GitHubTokenResponse,
  githubUser: GitHubUserProfile
): Promise<Response> {
  const email = await resolveGitHubEmail(tokenData.access_token, githubUser);

  let user = await db.getUserByGitHubId(githubUser.id);

  if (!user) {
    // Link a pre-existing email/password account with the same email
    const existing = await db.getUserByEmail(email);
    if (existing) {
      await db.setUserGitHubId(existing.id, githubUser.id);
      user = existing;
    }
  }

  if (!user) {
    const userId = crypto.randomUUID();
    await db.createUser({
      id: userId,
      email,
      passwordHash: "",
      name: githubUser.name || githubUser.login,
      githubUserId: githubUser.id,
    });
    user = await db.getUser(userId);
  }

  if (!user) {
    return redirectWithStatus(
      state.returnTo,
      "error",
      request.url,
      "Failed to create account",
      state.frontendOrigin
    );
  }

  const encryptedToken = await encryptGitHubAccessToken(
    tokenData.access_token,
    env.JWT_SECRET
  );
  await db.upsertGitHubConnection({
    userId: user.id,
    accessToken: encryptedToken,
    githubUserId: githubUser.id,
    githubUsername: githubUser.login,
    scopes: tokenData.scope,
  });

  const jwt = await signJWT(user.id, user.email, env.JWT_SECRET);

  const origin = state.frontendOrigin || new URL(request.url).origin;
  const url = new URL(state.returnTo, origin);
  url.searchParams.set("github", "connected");
  // Fragment keeps the token out of server logs and proxies
  url.hash = `token=${jwt}`;
  return Response.redirect(url.toString(), 302);
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
