import type { Env, FeedbackSubmission, FeedbackProjectSettings } from "../types";
import { FeedbackDB } from "./db";
import { FeedbackClassifier } from "./classifier";
import {
  hashPassword,
  verifyPassword,
  signJWT,
  authenticateRequest,
  encryptToken,
  decryptToken,
} from "./auth";

function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  // 204 (No Content) and 205 (Reset Content) responses must not have a body
  const noBodyStatuses = [204, 205];
  const hasBody = !noBodyStatuses.includes(status);
  
  return new Response(hasBody ? JSON.stringify(body) : null, {
    status,
    headers: {
      ...(hasBody && { "Content-Type": "application/json" }),
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
      ...extraHeaders,
    },
  });
}

export async function handleFeedbackRoutes(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | null> {
  if (request.method === "OPTIONS") {
    return jsonResponse(null, 204);
  }

  const db = new FeedbackDB(env.DB);
  await db.init();

  // --- Auth routes (public) ---

  if (pathname === "/api/auth/register" && request.method === "POST") {
    return handleRegister(request, env, db);
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    return handleLogin(request, env, db);
  }

  if (pathname === "/api/auth/me" && request.method === "GET") {
    return handleMe(request, env, db);
  }

  // --- Feedback submission (API-key auth, used by widget) ---

  if (pathname === "/api/feedback/submit" && request.method === "POST") {
    return handleSubmit(request, env, db);
  }

  // --- Protected routes (JWT auth, used by dashboard) ---

  if (pathname === "/api/feedback/projects" && request.method === "POST") {
    return handleCreateProject(request, env, db);
  }

  if (pathname === "/api/feedback/projects" && request.method === "GET") {
    return handleListProjects(request, env, db);
  }

  const widgetConfigMatch = pathname.match(
    /^\/api\/feedback\/widget-config\/([^/]+)$/
  );
  if (widgetConfigMatch && request.method === "GET") {
    return handleWidgetConfig(widgetConfigMatch[1], db);
  }

  const projectDetailMatch = pathname.match(
    /^\/api\/feedback\/projects\/([^/]+)$/
  );
  if (projectDetailMatch && request.method === "GET") {
    return handleGetProject(request, env, db, projectDetailMatch[1]);
  }

  if (projectDetailMatch && request.method === "PUT") {
    return handleUpdateProject(request, env, db, projectDetailMatch[1]);
  }

  const listMatch = pathname.match(
    /^\/api\/dashboard\/projects\/([^/]+)\/feedback$/
  );
  if (listMatch && request.method === "GET") {
    return handleListFeedback(request, env, db, listMatch[1]);
  }

  const detailMatch = pathname.match(
    /^\/api\/dashboard\/projects\/([^/]+)\/feedback\/([^/]+)$/
  );
  if (detailMatch && request.method === "GET") {
    return handleGetFeedback(request, env, db, detailMatch[1], detailMatch[2]);
  }

  if (detailMatch && request.method === "PATCH") {
    return handleUpdateStatus(request, env, db, detailMatch[1], detailMatch[2]);
  }

  return null;
}

// --- Auth Handlers ---

async function handleRegister(
  request: Request,
  env: Env,
  db: FeedbackDB
): Promise<Response> {
  let body: { email?: string; password?: string; name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (!body.email || !body.password) {
    return jsonResponse(
      { success: false, error: "Email and password are required" },
      400
    );
  }

  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ success: false, error: "Invalid email format" }, 400);
  }

  if (body.password.length < 8) {
    return jsonResponse(
      { success: false, error: "Password must be at least 8 characters" },
      400
    );
  }

  const existing = await db.getUserByEmail(email);
  if (existing) {
    return jsonResponse(
      { success: false, error: "An account with this email already exists" },
      409
    );
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);

  try {
    await db.createUser({
      id: userId,
      email,
      passwordHash,
      name: body.name?.trim(),
    });

    const token = await signJWT(userId, email, env.JWT_SECRET);

    return jsonResponse({
      success: true,
      data: {
        token,
        user: { id: userId, email, name: body.name?.trim() },
      },
    });
  } catch (e) {
    console.error("Error creating user:", e);
    return jsonResponse({ success: false, error: "Failed to create account" }, 500);
  }
}

async function handleLogin(
  request: Request,
  env: Env,
  db: FeedbackDB
): Promise<Response> {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (!body.email || !body.password) {
    return jsonResponse(
      { success: false, error: "Email and password are required" },
      400
    );
  }

  const email = body.email.trim().toLowerCase();
  const user = await db.getUserByEmail(email);

  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return jsonResponse(
      { success: false, error: "Invalid email or password" },
      401
    );
  }

  const token = await signJWT(user.id, user.email, env.JWT_SECRET);

  return jsonResponse({
    success: true,
    data: {
      token,
      user: { id: user.id, email: user.email, name: user.name },
    },
  });
}

async function handleMe(
  request: Request,
  env: Env,
  db: FeedbackDB
): Promise<Response> {
  const auth = await authenticateRequest(request, env, db);
  if (!auth.ok) return auth.response;

  return jsonResponse({
    success: true,
    data: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
    },
  });
}

// --- Feedback Submission (API-key auth) ---

async function handleSubmit(
  request: Request,
  env: Env,
  db: FeedbackDB
): Promise<Response> {
  const apiKey = request.headers.get("X-API-Key");
  if (!apiKey) {
    return jsonResponse({ success: false, error: "Missing X-API-Key header" }, 401);
  }

  let body: FeedbackSubmission;
  try {
    body = (await request.json()) as FeedbackSubmission;
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (!body.projectId || !body.title || !body.description) {
    return jsonResponse(
      { success: false, error: "Missing required fields: projectId, title, description" },
      400
    );
  }

  const project = await db.getProjectByApiKey(apiKey);
  if (!project || project.id !== body.projectId) {
    return jsonResponse(
      { success: false, error: "Invalid API key or project mismatch" },
      403
    );
  }

  try {
    const feedbackId = crypto.randomUUID();

    const classifier = new FeedbackClassifier(env.AI);
    const classification = await classifier.classify(body.description);

    await db.createFeedback({
      id: feedbackId,
      projectId: body.projectId,
      type: classification.type,
      category: classification.category,
      title: body.title,
      description: body.description,
      email: body.email,
      metadata: body.metadata,
    });

    await db.storeAIAnalysis(feedbackId, classification);

    if (
      classification.type === "technical" &&
      project.settings.enableAutoPR &&
      project.githubRepo &&
      project.githubToken
    ) {
      triggerAutoPR(env, db, feedbackId, body, classification, project).catch(
        (e) => console.error("Auto-PR failed:", e)
      );
    }

    return jsonResponse({
      success: true,
      data: { feedbackId, type: classification.type, category: classification.category },
    });
  } catch (e) {
    console.error("Error processing feedback:", e);
    return jsonResponse({ success: false, error: "Failed to process feedback" }, 500);
  }
}

async function triggerAutoPR(
  env: Env,
  db: FeedbackDB,
  feedbackId: string,
  submission: FeedbackSubmission,
  classification: { type: string; extractedInfo?: Record<string, string> },
  project: { githubRepo?: string; githubToken?: string; settings: FeedbackProjectSettings }
) {
  if (!project.githubRepo || !project.githubToken) return;

  let token: string;
  try {
    token = await decryptToken(project.githubToken, env.JWT_SECRET);
  } catch {
    // Fallback: token may have been stored before encryption was added
    token = project.githubToken;
  }

  const prDescription = [
    `## User Feedback (${feedbackId})`,
    "",
    submission.description,
    "",
    classification.extractedInfo?.errorMessage
      ? `**Error:** ${classification.extractedInfo.errorMessage}`
      : "",
    classification.extractedInfo?.componentName
      ? `**Component:** ${classification.extractedInfo.componentName}`
      : "",
    "",
    `*Auto-generated from feedback submission*`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const agentId = env.GitHubPRAgent.idFromName(`feedback-${project.githubRepo}`);
    const stub = env.GitHubPRAgent.get(agentId);

    await stub.fetch(
      new Request("https://agent/setGitHubToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args: [token] }),
      })
    );

    const prResponse = await stub.fetch(
      new Request("https://agent/createPR", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          args: [
            {
              repoUrl: project.githubRepo,
              description: prDescription,
              branchName: `feedback/${feedbackId.slice(0, 8)}`,
              targetBranch: project.settings.defaultTargetBranch || "main",
            },
          ],
        }),
      })
    );

    const result = (await prResponse.json()) as {
      success?: boolean;
      prUrl?: string;
      branchName?: string;
    };

    if (result.success && result.prUrl) {
      const prNumber = parseInt(result.prUrl.split("/").pop() || "0", 10);
      await db.linkPRToFeedback(feedbackId, result.prUrl, prNumber);
    }
  } catch (e) {
    console.error("Auto-PR agent call failed:", e);
  }
}

// --- Project Handlers (JWT-protected) ---

async function handleCreateProject(
  request: Request,
  env: Env,
  db: FeedbackDB
): Promise<Response> {
  const auth = await authenticateRequest(request, env, db);
  if (!auth.ok) return auth.response;

  let body: {
    name?: string;
    description?: string;
    githubRepo?: string;
    githubToken?: string;
    settings?: Partial<FeedbackProjectSettings>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (!body.name) {
    return jsonResponse(
      { success: false, error: "Project name is required" },
      400
    );
  }

  const projectId = crypto.randomUUID();
  const apiKey = `fbk_${crypto.randomUUID().replace(/-/g, "")}`;

  let encryptedGithubToken: string | undefined;
  if (body.githubToken) {
    encryptedGithubToken = await encryptToken(body.githubToken, env.JWT_SECRET);
  }

  const settings: FeedbackProjectSettings = {
    enableAutoPR: body.settings?.enableAutoPR ?? false,
    autoClassify: body.settings?.autoClassify ?? true,
    prAssignee: body.settings?.prAssignee,
    defaultTargetBranch: body.settings?.defaultTargetBranch,
  };

  try {
    await db.createProject({
      id: projectId,
      name: body.name,
      apiKey,
      description: body.description,
      ownerId: auth.user.id,
      githubToken: encryptedGithubToken,
      githubRepo: body.githubRepo,
      settings,
    });

    return jsonResponse({
      success: true,
      data: { projectId, apiKey, name: body.name },
    });
  } catch (e) {
    console.error("Error creating project:", e);
    return jsonResponse({ success: false, error: "Failed to create project" }, 500);
  }
}

async function handleListProjects(
  request: Request,
  env: Env,
  db: FeedbackDB
): Promise<Response> {
  const auth = await authenticateRequest(request, env, db);
  if (!auth.ok) return auth.response;

  try {
    const projects = await db.getProjectsByOwner(auth.user.id);
    const safe = projects.map((p) => ({
      id: p.id,
      name: p.name,
      apiKey: p.apiKey,
      description: p.description,
      githubRepo: p.githubRepo,
      hasGithubToken: !!p.githubToken,
      settings: p.settings,
      createdAt: p.createdAt,
    }));
    return jsonResponse({ success: true, data: safe });
  } catch (e) {
    console.error("Error listing projects:", e);
    return jsonResponse({ success: false, error: "Failed to list projects" }, 500);
  }
}

async function handleGetProject(
  request: Request,
  env: Env,
  db: FeedbackDB,
  projectId: string
): Promise<Response> {
  const auth = await authenticateRequest(request, env, db);
  if (!auth.ok) return auth.response;

  const project = await db.getProject(projectId);
  if (!project || project.ownerId !== auth.user.id) {
    return jsonResponse({ success: false, error: "Project not found" }, 404);
  }

  return jsonResponse({
    success: true,
    data: {
      id: project.id,
      name: project.name,
      apiKey: project.apiKey,
      description: project.description,
      githubRepo: project.githubRepo,
      hasGithubToken: !!project.githubToken,
      settings: project.settings,
      createdAt: project.createdAt,
    },
  });
}

async function handleUpdateProject(
  request: Request,
  env: Env,
  db: FeedbackDB,
  projectId: string
): Promise<Response> {
  const auth = await authenticateRequest(request, env, db);
  if (!auth.ok) return auth.response;

  const project = await db.getProject(projectId);
  if (!project || project.ownerId !== auth.user.id) {
    return jsonResponse({ success: false, error: "Project not found" }, 404);
  }

  let body: {
    name?: string;
    description?: string;
    githubRepo?: string;
    githubToken?: string;
    settings?: Partial<FeedbackProjectSettings>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  let encryptedGithubToken = project.githubToken;
  if (body.githubToken !== undefined) {
    encryptedGithubToken = body.githubToken
      ? await encryptToken(body.githubToken, env.JWT_SECRET)
      : undefined;
  }

  const updatedSettings: FeedbackProjectSettings = {
    ...project.settings,
    ...body.settings,
  };

  try {
    await db.updateProject(projectId, {
      name: body.name ?? project.name,
      description: body.description ?? project.description,
      githubRepo: body.githubRepo ?? project.githubRepo,
      githubToken: encryptedGithubToken,
      settings: updatedSettings,
    });

    return jsonResponse({ success: true });
  } catch (e) {
    console.error("Error updating project:", e);
    return jsonResponse({ success: false, error: "Failed to update project" }, 500);
  }
}

async function handleWidgetConfig(
  projectId: string,
  db: FeedbackDB
): Promise<Response> {
  const project = await db.getProject(projectId);
  if (!project) {
    return jsonResponse({ success: false, error: "Project not found" }, 404);
  }

  return jsonResponse({
    success: true,
    data: {
      projectId: project.id,
      projectName: project.name,
      theme: "light",
      position: "bottom-right",
      primaryColor: "#007bff",
      title: "Send us your feedback",
    },
  });
}

// --- Dashboard Feedback Handlers (JWT-protected) ---

async function handleListFeedback(
  request: Request,
  env: Env,
  db: FeedbackDB,
  projectId: string
): Promise<Response> {
  const auth = await authenticateRequest(request, env, db);
  if (!auth.ok) return auth.response;

  const project = await db.getProject(projectId);
  if (!project || project.ownerId !== auth.user.id) {
    return jsonResponse({ success: false, error: "Project not found" }, 404);
  }

  const url = new URL(request.url);
  const filters = {
    type: url.searchParams.get("type") || undefined,
    status: url.searchParams.get("status") || undefined,
    limit: parseInt(url.searchParams.get("limit") || "20", 10),
    offset: parseInt(url.searchParams.get("offset") || "0", 10),
  };

  try {
    const data = await db.getFeedbackByProject(projectId, filters);
    return jsonResponse({ success: true, data });
  } catch (e) {
    console.error("Error listing feedback:", e);
    return jsonResponse({ success: false, error: "Failed to list feedback" }, 500);
  }
}

async function handleGetFeedback(
  request: Request,
  env: Env,
  db: FeedbackDB,
  projectId: string,
  feedbackId: string
): Promise<Response> {
  const auth = await authenticateRequest(request, env, db);
  if (!auth.ok) return auth.response;

  const project = await db.getProject(projectId);
  if (!project || project.ownerId !== auth.user.id) {
    return jsonResponse({ success: false, error: "Project not found" }, 404);
  }

  const feedback = await db.getFeedback(feedbackId);
  if (!feedback || feedback.projectId !== projectId) {
    return jsonResponse({ success: false, error: "Feedback not found" }, 404);
  }
  return jsonResponse({ success: true, data: feedback });
}

async function handleUpdateStatus(
  request: Request,
  env: Env,
  db: FeedbackDB,
  projectId: string,
  feedbackId: string
): Promise<Response> {
  const auth = await authenticateRequest(request, env, db);
  if (!auth.ok) return auth.response;

  const project = await db.getProject(projectId);
  if (!project || project.ownerId !== auth.user.id) {
    return jsonResponse({ success: false, error: "Project not found" }, 404);
  }

  let body: { status?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const validStatuses = ["pending", "in-progress", "completed", "dismissed"];
  if (!body.status || !validStatuses.includes(body.status)) {
    return jsonResponse(
      { success: false, error: `Status must be one of: ${validStatuses.join(", ")}` },
      400
    );
  }

  try {
    await db.updateFeedbackStatus(feedbackId, body.status);
    return jsonResponse({ success: true });
  } catch (e) {
    console.error("Error updating status:", e);
    return jsonResponse({ success: false, error: "Failed to update status" }, 500);
  }
}
