import type {
  Feedback,
  FeedbackProject,
  FeedbackClassification,
  FeedbackProjectSettings,
  DashboardUser,
} from "../types";

export class FeedbackDB {
  private initialized = false;

  constructor(private db: D1Database) {}

  async init() {
    if (this.initialized) return;

    await this.db.batch([
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS feedback (
          id TEXT PRIMARY KEY,
          projectId TEXT NOT NULL,
          type TEXT NOT NULL,
          category TEXT,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          email TEXT,
          status TEXT DEFAULT 'pending',
          metadata TEXT,
          aiAnalysis TEXT,
          relatedPRUrl TEXT,
          relatedPRNumber INTEGER,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )
      `),
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS feedback_projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          apiKey TEXT UNIQUE NOT NULL,
          description TEXT,
          ownerId TEXT NOT NULL,
          githubToken TEXT,
          githubRepo TEXT,
          settings TEXT NOT NULL,
          createdAt TEXT NOT NULL
        )
      `),
      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_feedback_project ON feedback(projectId)
      `),
      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)
      `),
      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type)
      `),
      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_project_apikey ON feedback_projects(apiKey)
      `),
      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_project_owner ON feedback_projects(ownerId)
      `),
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS dashboard_users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          passwordHash TEXT NOT NULL,
          name TEXT,
          createdAt TEXT NOT NULL
        )
      `),
      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON dashboard_users(email)
      `),
    ]);

    this.initialized = true;
  }

  // --- Feedback ---

  async createFeedback(feedback: {
    id: string;
    projectId: string;
    type: string;
    category?: string;
    title: string;
    description: string;
    email?: string;
    metadata?: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    return this.db
      .prepare(
        `INSERT INTO feedback (id, projectId, type, category, title, description, email, status, metadata, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      )
      .bind(
        feedback.id,
        feedback.projectId,
        feedback.type,
        feedback.category ?? null,
        feedback.title,
        feedback.description,
        feedback.email ?? null,
        JSON.stringify(feedback.metadata ?? {}),
        now,
        now
      )
      .run();
  }

  async getFeedback(id: string): Promise<Feedback | null> {
    const row = await this.db
      .prepare(`SELECT * FROM feedback WHERE id = ?`)
      .bind(id)
      .first();
    return row ? this.parseFeedbackRow(row) : null;
  }

  async getFeedbackByProject(
    projectId: string,
    filters?: {
      type?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<Feedback[]> {
    const conditions = ["projectId = ?"];
    const params: unknown[] = [projectId];

    if (filters?.type) {
      conditions.push("type = ?");
      params.push(filters.type);
    }
    if (filters?.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const where = conditions.join(" AND ");
    const limit = filters?.limit ?? 20;
    const offset = filters?.offset ?? 0;
    params.push(limit, offset);

    const result = await this.db
      .prepare(
        `SELECT * FROM feedback WHERE ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`
      )
      .bind(...params)
      .all();

    return (result.results ?? []).map((row) => this.parseFeedbackRow(row));
  }

  async updateFeedbackStatus(id: string, status: string) {
    return this.db
      .prepare(`UPDATE feedback SET status = ?, updatedAt = ? WHERE id = ?`)
      .bind(status, new Date().toISOString(), id)
      .run();
  }

  async linkPRToFeedback(
    feedbackId: string,
    prUrl: string,
    prNumber: number
  ) {
    return this.db
      .prepare(
        `UPDATE feedback SET relatedPRUrl = ?, relatedPRNumber = ?, updatedAt = ? WHERE id = ?`
      )
      .bind(prUrl, prNumber, new Date().toISOString(), feedbackId)
      .run();
  }

  async storeAIAnalysis(feedbackId: string, analysis: FeedbackClassification) {
    return this.db
      .prepare(
        `UPDATE feedback SET aiAnalysis = ?, updatedAt = ? WHERE id = ?`
      )
      .bind(JSON.stringify(analysis), new Date().toISOString(), feedbackId)
      .run();
  }

  // --- Projects ---

  async createProject(project: {
    id: string;
    name: string;
    apiKey: string;
    description?: string;
    ownerId: string;
    githubToken?: string;
    githubRepo?: string;
    settings: FeedbackProjectSettings;
  }) {
    return this.db
      .prepare(
        `INSERT INTO feedback_projects (id, name, apiKey, description, ownerId, githubToken, githubRepo, settings, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        project.id,
        project.name,
        project.apiKey,
        project.description ?? null,
        project.ownerId,
        project.githubToken ?? null,
        project.githubRepo ?? null,
        JSON.stringify(project.settings),
        new Date().toISOString()
      )
      .run();
  }

  async getProjectByApiKey(apiKey: string): Promise<FeedbackProject | null> {
    const row = await this.db
      .prepare(`SELECT * FROM feedback_projects WHERE apiKey = ?`)
      .bind(apiKey)
      .first();
    return row ? this.parseProjectRow(row) : null;
  }

  async getProject(projectId: string): Promise<FeedbackProject | null> {
    const row = await this.db
      .prepare(`SELECT * FROM feedback_projects WHERE id = ?`)
      .bind(projectId)
      .first();
    return row ? this.parseProjectRow(row) : null;
  }

  async updateProject(
    projectId: string,
    updates: {
      name: string;
      description?: string;
      githubRepo?: string;
      githubToken?: string | null;
      settings: FeedbackProjectSettings;
    }
  ) {
    return this.db
      .prepare(
        `UPDATE feedback_projects
         SET name = ?, description = ?, githubRepo = ?, githubToken = ?, settings = ?
         WHERE id = ?`
      )
      .bind(
        updates.name,
        updates.description ?? null,
        updates.githubRepo ?? null,
        updates.githubToken ?? null,
        JSON.stringify(updates.settings),
        projectId
      )
      .run();
  }

  async getProjectsByOwner(ownerId: string): Promise<FeedbackProject[]> {
    const result = await this.db
      .prepare(`SELECT * FROM feedback_projects WHERE ownerId = ?`)
      .bind(ownerId)
      .all();
    return (result.results ?? []).map((row) => this.parseProjectRow(row));
  }

  // --- Users ---

  async createUser(user: {
    id: string;
    email: string;
    passwordHash: string;
    name?: string;
  }) {
    return this.db
      .prepare(
        `INSERT INTO dashboard_users (id, email, passwordHash, name, createdAt)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(
        user.id,
        user.email,
        user.passwordHash,
        user.name ?? null,
        new Date().toISOString()
      )
      .run();
  }

  async getUserByEmail(email: string): Promise<DashboardUser | null> {
    const row = await this.db
      .prepare(`SELECT * FROM dashboard_users WHERE email = ?`)
      .bind(email)
      .first();
    return (row as DashboardUser | null) ?? null;
  }

  async getUser(userId: string): Promise<DashboardUser | null> {
    const row = await this.db
      .prepare(`SELECT * FROM dashboard_users WHERE id = ?`)
      .bind(userId)
      .first();
    return (row as DashboardUser | null) ?? null;
  }

  // --- Parsing helpers ---

  private parseFeedbackRow(row: Record<string, unknown>): Feedback {
    return {
      ...(row as unknown as Feedback),
      metadata: this.parseJSON(row.metadata as string | null, {}),
      aiAnalysis: this.parseJSON(row.aiAnalysis as string | null, undefined),
    };
  }

  private parseProjectRow(row: Record<string, unknown>): FeedbackProject {
    return {
      ...(row as unknown as FeedbackProject),
      settings: this.parseJSON(row.settings as string | null, {
        enableAutoPR: false,
        autoClassify: true,
      }),
    };
  }

  private parseJSON<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
}
