import {execSync} from 'child_process';

export interface DiffStats {
  additions: number;
  deletions: number;
  total: number;
}

export function getDiffStats(repoPath: string, commitHash: string): DiffStats {
  const gitDir = repoPath === '.' ? '' : `-C ${repoPath}`;
  
  let output = '';
  
  try {
    output = execSync(
      `git ${gitDir} diff --shortstat ${commitHash}^..${commitHash}`,
      {encoding: 'utf-8', maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore']}
    ).trim();
  } catch {
    try {
      output = execSync(
        `git ${gitDir} show --shortstat --format= ${commitHash}`,
        {encoding: 'utf-8', maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore']}
      ).trim();
    } catch {
      return {additions: 0, deletions: 0, total: 0};
    }
  }

  if (!output) {
    return {additions: 0, deletions: 0, total: 0};
  }

  const match = output.match(/(\d+)\s+insertion/i);
  const additions = match ? parseInt(match[1], 10) : 0;

  const delMatch = output.match(/(\d+)\s+deletion/i);
  const deletions = delMatch ? parseInt(delMatch[1], 10) : 0;

  return {
    additions,
    deletions,
    total: additions + deletions,
  };
}
