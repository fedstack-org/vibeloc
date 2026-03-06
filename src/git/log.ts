import {execSync} from 'child_process';
import {Commit, CoAuthor} from '../types';

const CO_AUTHOR_REGEX = /^co-authored-by:\s+(.+)\s+<(.+)>$/i;
const AI_EMAIL_PATTERNS = [
  /\[bot\]/i,
  /@anthropic\.com$/i,
  /copilot@users\.noreply\.github\.com$/i,
];

export function isAIEmail(email: string): boolean {
  return AI_EMAIL_PATTERNS.some(pattern => pattern.test(email));
}

export function parseAgentInfo(name: string, email: string): { agentName: string; model?: string } | undefined {
  const lowerEmail = email.toLowerCase();
  const lowerName = name.toLowerCase();

  if (lowerEmail.includes('anthropic.com') || lowerName.includes('claude')) {
    const modelMatch = name.match(/claude\s+(opus|sonnet|haiku|haiku-3\.5)?[\s\.]([\d\.]+)?/i);
    const model = modelMatch ? `Claude ${(modelMatch[1] || 'unknown').charAt(0).toUpperCase() + (modelMatch[1] || '').slice(1).toLowerCase()}${modelMatch[2] ? ` ${modelMatch[2]}` : ''}`.trim() : 'Claude';
    return { agentName: 'Claude Code', model };
  }

  if (lowerEmail.includes('factory-droid') || (lowerEmail.includes('[bot]') && !lowerName.includes('copilot'))) {
    return { agentName: 'Droid' };
  }

  if (lowerName.includes('copilot') || lowerEmail.includes('copilot@users.noreply.github.com')) {
    return { agentName: 'GitHub Copilot' };
  }

  return undefined;
}

export function getGitLog(repoPath: string): Commit[] {
  const gitDir = repoPath === '.' ? '' : `-C ${repoPath}`;
  const output = execSync(
    `git ${gitDir} log --all --no-merges --format=format:"%H%n%an%n%ae%n%cn%n%ce%n%B%x00"`,
    {encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024}
  );

  const commits: Commit[] = [];
  const records = output.split('\x00').filter(s => s);

  for (const record of records) {
    const cleanRecord = record.startsWith('\n') ? record.slice(1) : record;
    const lines = cleanRecord.split('\n');
    if (lines.length < 6) continue;

    const hash = lines[0];
    const authorName = lines[1];
    const authorEmail = lines[2];
    const committerName = lines[3];
    const committerEmail = lines[4];
    const message = lines.slice(5).join('\n');

    if (!hash || hash.length < 10) continue;

    const coAuthors: CoAuthor[] = [];
    const messageLines = message.split('\n');
    for (const msgLine of messageLines) {
      const match = msgLine.trim().match(CO_AUTHOR_REGEX);
      if (match) {
        const coAuthorName = match[1].trim();
        const coAuthorEmail = match[2].trim().toLowerCase();
        const agentInfo = parseAgentInfo(coAuthorName, coAuthorEmail);
        coAuthors.push({
          name: coAuthorName,
          email: coAuthorEmail,
          agentName: agentInfo?.agentName,
          model: agentInfo?.model,
        });
      }
    }

    commits.push({
      hash: hash.trim(),
      authorName: authorName.trim(),
      authorEmail: authorEmail.trim().toLowerCase(),
      committerName: committerName.trim(),
      committerEmail: committerEmail.trim().toLowerCase(),
      message: message.trim(),
      coAuthors,
    });
  }

  return commits;
}
