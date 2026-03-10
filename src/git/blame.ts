import {execSync} from 'child_process';
import {Commit, CoAuthor} from '../types';
import {isAIEmail, isBotEmail, parseAgentInfo} from './log';

const CO_AUTHOR_REGEX = /^co-authored-by:\s+(.+)\s+<(.+)>$/i;

export interface BlameLine {
  commitHash: string;
}

export function getTrackedFiles(repoPath: string): string[] {
  const gitDir = repoPath === '.' ? '' : `-C ${repoPath}`;
  const output = execSync(
    `git ${gitDir} ls-files`,
    {encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024}
  ).trim();
  if (!output) return [];
  return output.split('\n').filter(f => f.length > 0);
}

export function getBlameLines(repoPath: string, filePath: string): BlameLine[] {
  const gitDir = repoPath === '.' ? '' : `-C ${repoPath}`;
  let output: string;
  try {
    output = execSync(
      `git ${gitDir} blame --porcelain -- ${JSON.stringify(filePath)}`,
      {encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore']}
    );
  } catch {
    return [];
  }

  const lines = output.split('\n');
  const result: BlameLine[] = [];
  for (const line of lines) {
    // Each blame block starts with: <40-char-hash> <orig-line> <final-line> [<num-lines>]
    const match = line.match(/^([0-9a-f]{40}) \d+ \d+/);
    if (match) {
      const hash = match[1];
      // Skip uncommitted changes
      if (hash === '0000000000000000000000000000000000000000') continue;
      result.push({commitHash: hash});
    }
  }
  return result;
}

export function parseBlameCommits(repoPath: string, hashes: Set<string>): Map<string, Commit> {
  if (hashes.size === 0) return new Map();

  const gitDir = repoPath === '.' ? '' : `-C ${repoPath}`;
  const hashList = Array.from(hashes).join('\n');

  let output: string;
  try {
    output = execSync(
      `git ${gitDir} cat-file --batch --follow-symlinks`,
      {
        encoding: 'utf-8',
        maxBuffer: 100 * 1024 * 1024,
        input: hashList,
        stdio: ['pipe', 'pipe', 'ignore'],
      }
    );
  } catch {
    return parseBlameCommitsFallback(repoPath, hashes);
  }

  // git cat-file --batch outputs: "<hash> commit <size>\n<raw commit object>\n" for each
  const result = new Map<string, Commit>();
  let pos = 0;
  const text = output;

  while (pos < text.length) {
    const newline = text.indexOf('\n', pos);
    if (newline === -1) break;
    const header = text.slice(pos, newline);
    pos = newline + 1;

    const headerMatch = header.match(/^([0-9a-f]{40}) commit (\d+)$/);
    if (!headerMatch) {
      // skip unknown or missing objects
      const nextBlock = text.indexOf('\n\n', pos);
      if (nextBlock === -1) break;
      pos = nextBlock + 2;
      continue;
    }

    const hash = headerMatch[1];
    const size = parseInt(headerMatch[2], 10);
    const rawCommit = text.slice(pos, pos + size);
    pos += size + 1; // +1 for trailing newline after object

    const commit = parseRawCommit(hash, rawCommit);
    if (commit) result.set(hash, commit);
  }

  return result;
}

function parseRawCommit(hash: string, raw: string): Commit | undefined {
  const lines = raw.split('\n');
  let authorName = '';
  let authorEmail = '';
  let committerName = '';
  let committerEmail = '';
  const messageLines: string[] = [];
  let inBody = false;

  for (const line of lines) {
    if (!inBody) {
      if (line === '') {
        inBody = true;
        continue;
      }
      const authorMatch = line.match(/^author (.+) <(.+)> \d+/);
      if (authorMatch) {
        authorName = authorMatch[1].trim();
        authorEmail = authorMatch[2].trim().toLowerCase();
        continue;
      }
      const committerMatch = line.match(/^committer (.+) <(.+)> \d+/);
      if (committerMatch) {
        committerName = committerMatch[1].trim();
        committerEmail = committerMatch[2].trim().toLowerCase();
        continue;
      }
    } else {
      messageLines.push(line);
    }
  }

  const message = messageLines.join('\n').trim();
  const coAuthors: CoAuthor[] = [];
  for (const msgLine of message.split('\n')) {
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

  return {
    hash,
    authorName,
    authorEmail,
    committerName,
    committerEmail,
    message,
    coAuthors,
  };
}

function parseBlameCommitsFallback(repoPath: string, hashes: Set<string>): Map<string, Commit> {
  const gitDir = repoPath === '.' ? '' : `-C ${repoPath}`;
  const result = new Map<string, Commit>();
  for (const hash of hashes) {
    try {
      const output = execSync(
        `git ${gitDir} log -1 --format=format:"%an%n%ae%n%cn%n%ce%n%B" ${hash}`,
        {encoding: 'utf-8', maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore']}
      ).trim();
      const lines = output.split('\n');
      if (lines.length < 4) continue;
      const authorName = lines[0];
      const authorEmail = lines[1].toLowerCase();
      const committerName = lines[2];
      const committerEmail = lines[3].toLowerCase();
      const message = lines.slice(4).join('\n').trim();
      const coAuthors: CoAuthor[] = [];
      for (const msgLine of message.split('\n')) {
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
      result.set(hash, {hash, authorName, authorEmail, committerName, committerEmail, message, coAuthors});
    } catch {
      // skip
    }
  }
  return result;
}

export function classifyLine(commit: Commit): 'human' | 'ai' | 'human+ai' | 'bot' | 'skip' {
  const coAuthorAis = commit.coAuthors.filter(ca => isAIEmail(ca.email));
  const authorEmail = commit.authorEmail;

  if (coAuthorAis.length > 0) {
    return 'human+ai';
  }
  if (isAIEmail(authorEmail)) {
    return 'ai';
  }
  if (isBotEmail(authorEmail)) {
    return 'bot';
  }
  return 'human';
}
