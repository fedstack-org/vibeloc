const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CLI_PATH = path.join(PROJECT_ROOT, 'dist', 'index.js');

test('analyze and snapshot attribute Codex and human co-authors correctly', () => {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vibeloc-test-'));

  initRepo(repoPath);
  commitFile(repoPath, {
    filename: 'a.txt',
    lineCount: 2,
    message: 'feat: add baseline human file',
  });
  commitFile(repoPath, {
    filename: 'b.txt',
    lineCount: 5,
    message: 'feat: add shared human file',
    coAuthors: [
      {name: 'Bob Example', email: 'bob@example.com'},
    ],
  });
  commitFile(repoPath, {
    filename: 'c.txt',
    lineCount: 4,
    message: 'feat: add codex assisted file',
    coAuthors: [
      {name: 'OpenAI Codex', email: 'codex@openai.com'},
    ],
  });
  commitFile(repoPath, {
    filename: 'd.txt',
    lineCount: 3,
    message: 'feat: add mixed collaboration file',
    coAuthors: [
      {name: 'Bob Example', email: 'bob@example.com'},
      {name: 'Claude Sonnet 4.6', email: 'noreply@anthropic.com'},
    ],
  });
  commitFile(repoPath, {
    filename: 'e.txt',
    lineCount: 1,
    message: 'feat: dedupe repeated co-authors',
    coAuthors: [
      {name: 'Bob Example', email: 'bob@example.com'},
      {name: 'Bob Example', email: 'bob@example.com'},
      {name: 'Alice Example', email: 'alice@example.com'},
      {name: 'Codex', email: 'assistant@example.com'},
      {name: 'Codex', email: 'assistant@example.com'},
    ],
  });

  const analyzeOutput = parseTables(runCli([repoPath]));
  assert.deepEqual(findRow(analyzeOutput, 'Human', row => row[0] === 'alice@example.com'), ['alice@example.com', '5', '12']);
  assert.deepEqual(findRow(analyzeOutput, 'Human', row => row[0] === 'bob@example.com'), ['bob@example.com', '3', '3']);
  assert.deepEqual(findRow(analyzeOutput, 'AI', row => row[0] === 'Codex'), ['Codex', '*', '2', '5']);
  assert.deepEqual(findRow(analyzeOutput, 'AI', row => row[0] === 'Claude Code'), ['Claude Code', '*', '1', '3']);
  assert.deepEqual(findRow(analyzeOutput, 'Human + AI', row => row[0] === 'alice@example.com' && row[1] === 'Codex'), ['alice@example.com', 'Codex', '*', '2', '5']);
  assert.deepEqual(findRow(analyzeOutput, 'Human + AI', row => row[0] === 'bob@example.com' && row[1] === 'Codex'), ['bob@example.com', 'Codex', '*', '1', '1']);
  assert.deepEqual(findRow(analyzeOutput, 'Human + AI', row => row[0] === 'bob@example.com' && row[1] === 'Claude Code'), ['bob@example.com', 'Claude Code', '*', '1', '3']);
  assert.deepEqual(findRow(analyzeOutput, 'Human + Human', row => row[0] === 'alice@example.com' && row[1] === 'bob@example.com'), ['alice@example.com', 'bob@example.com', '3', '9']);
  assert.deepEqual(findRow(analyzeOutput, 'Vibe Rate (History, AI / Project Human LOC)', row => row[0] === '*'), ['*', '53.3%']);
  assert.deepEqual(findRow(analyzeOutput, 'Vibe Rate (History, AI / Project Human LOC)', row => row[0] === 'alice@example.com'), ['alice@example.com', '66.7%']);
  assert.deepEqual(findRow(analyzeOutput, 'Vibe Rate (History, AI / Project Human LOC)', row => row[0] === 'bob@example.com'), ['bob@example.com', '133.3%']);

  const snapshotOutput = parseTables(runCli(['snapshot', repoPath]));
  assert.deepEqual(findRow(snapshotOutput, 'Human', row => row[0] === 'alice@example.com'), ['alice@example.com', '12']);
  assert.deepEqual(findRow(snapshotOutput, 'Human', row => row[0] === 'bob@example.com'), ['bob@example.com', '3']);
  assert.deepEqual(findRow(snapshotOutput, 'AI', row => row[0] === 'Codex'), ['Codex', '*', '5']);
  assert.deepEqual(findRow(snapshotOutput, 'Human + AI', row => row[0] === 'alice@example.com' && row[1] === 'Codex'), ['alice@example.com', 'Codex', '*', '5']);
  assert.deepEqual(findRow(snapshotOutput, 'Human + Human', row => row[0] === 'alice@example.com' && row[1] === 'bob@example.com'), ['alice@example.com', 'bob@example.com', '9']);
  assert.deepEqual(findRow(snapshotOutput, 'Vibe Rate (Snapshot, AI / Project Human LOC)', row => row[0] === '*'), ['*', '53.3%']);
});

function initRepo(repoPath) {
  runGit(repoPath, ['init', '-b', 'main']);
  runGit(repoPath, ['config', 'user.name', 'Alice Example']);
  runGit(repoPath, ['config', 'user.email', 'alice@example.com']);
}

function commitFile(repoPath, {filename, lineCount, message, coAuthors = []}) {
  const filePath = path.join(repoPath, filename);
  const contents = Array.from({length: lineCount}, (_, index) => `${filename} line ${index + 1}`).join('\n') + '\n';
  fs.writeFileSync(filePath, contents);

  runGit(repoPath, ['add', filename]);

  const fullMessage = [
    message,
    ...coAuthors.map(coAuthor => `Co-authored-by: ${coAuthor.name} <${coAuthor.email}>`),
  ].join('\n\n');

  runGit(repoPath, ['commit', '--quiet', '-F', '-'], {
    input: fullMessage,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Alice Example',
      GIT_AUTHOR_EMAIL: 'alice@example.com',
      GIT_COMMITTER_NAME: 'Alice Example',
      GIT_COMMITTER_EMAIL: 'alice@example.com',
    },
  });
}

function runCli(args) {
  return stripAnsi(execFileSync('node', [CLI_PATH, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  }));
}

function runGit(repoPath, args, options = {}) {
  return execFileSync('git', ['-C', repoPath, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    ...options,
  });
}

function stripAnsi(text) {
  return text.replace(/\u001B\[[0-9;]*m/g, '');
}

function parseTables(output) {
  const sections = new Map();
  let currentSection = '';

  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('===')) {
      currentSection = line.replace(/^===\s*/, '').replace(/\s*===$/, '');
      sections.set(currentSection, []);
      continue;
    }

    if (!currentSection || !line.startsWith('│')) continue;

    const cells = line.split('│').slice(1, -1).map(cell => cell.trim());
    if (cells.every(cell => cell.length === 0)) continue;
    sections.get(currentSection).push(cells);
  }

  return sections;
}

function findRow(sections, sectionName, predicate) {
  const rows = sections.get(sectionName) || [];
  const row = rows.find(candidate => !isHeaderRow(candidate) && predicate(candidate));
  assert.ok(row, `Missing row in section "${sectionName}"`);
  return row;
}

function isHeaderRow(cells) {
  return ['Email', 'Agent', 'Human Email', 'Human A', 'Vibe Rate'].includes(cells[0]);
}
