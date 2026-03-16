export interface Commit {
  hash: string;
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  message: string;
  coAuthors: CoAuthor[];
}

export interface CoAuthor {
  name: string;
  email: string;
  agentName?: string;
  model?: string;
}

export interface ContributorStats {
  email: string;
  commits: number;
  lines: number;
}

export interface HumanAIStats {
  humanEmail: string;
  aiEmail: string;
  aiAgentName?: string;
  aiModel?: string;
  commits: number;
  lines: number;
}

export interface HumanHumanStats {
  humanAEmail: string;
  humanBEmail: string;
  commits: number;
  lines: number;
}
