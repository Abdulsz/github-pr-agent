export interface CompareFile {
  filename: string;
  patch?: string;
  additions: number;
  deletions: number;
  status?: string;
}

export interface CompareCommitsResult {
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  files?: CompareFile[];
}

export interface CodeSearchResult {
  path: string;
  fragments: string[];
}
