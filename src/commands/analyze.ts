import {Command, Option} from 'clipanion';
import Table from 'cli-table3';
import {getGitLog, isAIEmail} from '../git/log';
import {getDiffStats} from '../git/diff';
import {ContributorStats, HumanAIStats} from '../types';

interface AIStatsWithAgent extends ContributorStats {
  agentName?: string;
  model?: string;
}

export class AnalyzeCommand extends Command {
  static paths = [[`analyze`], [``]];

  repoPath = Option.String({required: false});

  async execute(): Promise<void> {
    const repoPath = this.repoPath || '.';

    this.context.stdout.write(`Analyzing git history in: ${repoPath}\n\n`);

    const commits = getGitLog(repoPath);

    const humanStatsMap = new Map<string, ContributorStats>();
    const aiStatsMap = new Map<string, AIStatsWithAgent>();
    const humanAiStatsMap = new Map<string, HumanAIStats>();

    for (const commit of commits) {
      const diffStats = getDiffStats(repoPath, commit.hash);
      const lines = diffStats.total;

      const coAuthorAis = commit.coAuthors.filter(ca => isAIEmail(ca.email));
      const humanEmail = commit.authorEmail;

      if (coAuthorAis.length === 0) {
        if (!isAIEmail(humanEmail)) {
          const key = humanEmail;
          const existing = humanStatsMap.get(key) || {email: key, commits: 0, lines: 0};
          existing.commits += 1;
          existing.lines += lines;
          humanStatsMap.set(key, existing);
        }
      } else {
        for (const ai of coAuthorAis) {
          const aiKey = ai.email;
          const existingAi = aiStatsMap.get(aiKey) || {email: aiKey, commits: 0, lines: 0, agentName: ai.agentName, model: ai.model};
          existingAi.commits += 1;
          existingAi.lines += lines;
          if (ai.agentName) existingAi.agentName = ai.agentName;
          if (ai.model) existingAi.model = ai.model;
          aiStatsMap.set(aiKey, existingAi);

          const humanAiKey = `${humanEmail} + ${aiKey}`;
          const existingHumanAi = humanAiStatsMap.get(humanAiKey) || {
            humanEmail,
            aiEmail: aiKey,
            aiAgentName: ai.agentName,
            aiModel: ai.model,
            commits: 0,
            lines: 0,
          };
          existingHumanAi.commits += 1;
          existingHumanAi.lines += lines;
          humanAiStatsMap.set(humanAiKey, existingHumanAi);
        }
      }
    }

    const humanStats = Array.from(humanStatsMap.values()).sort((a, b) => b.lines - a.lines);
    const aiStats = Array.from(aiStatsMap.values()).sort((a, b) => b.lines - a.lines);
    const humanAiStats = Array.from(humanAiStatsMap.values()).sort((a, b) => b.lines - a.lines);

    const humanTable = new Table({
      head: ['Email', 'Commits', 'Lines'],
      colWidths: [45, 10, 12],
      style: { head: ['cyan'], border: ['grey'] },
    });
    for (const stat of humanStats) {
      humanTable.push([stat.email, stat.commits, stat.lines]);
    }
    this.context.stdout.write('=== Human Only ===\n');
    this.context.stdout.write(humanTable.toString());
    this.context.stdout.write(`\nTotal: ${humanStats.length} contributors, ${humanStats.reduce((s, x) => s + x.lines, 0)} lines\n\n`);

    const aiTotalCommits = aiStats.reduce((s, x) => s + x.commits, 0);
    const aiTotalLines = aiStats.reduce((s, x) => s + x.lines, 0);

    const aiTable = new Table({
      head: ['Agent', 'Model', 'Commits', 'Lines'],
      colWidths: [25, 25, 10, 12],
      style: { head: ['magenta'], border: ['grey'] },
    });
    aiTable.push(['*', '*', aiTotalCommits, aiTotalLines]);
    for (const stat of aiStats) {
      const displayName = stat.agentName || stat.email;
      aiTable.push([displayName, stat.model || '-', stat.commits, stat.lines]);
    }
    this.context.stdout.write('=== AI ===\n');
    this.context.stdout.write(aiTable.toString());
    this.context.stdout.write(`\nTotal: ${aiStats.length} AI contributors, ${aiTotalLines} lines\n\n`);

    const humanAiTotalCommits = humanAiStats.reduce((s, x) => s + x.commits, 0);
    const humanAiTotalLines = humanAiStats.reduce((s, x) => s + x.lines, 0);

    const humanAiTable = new Table({
      head: ['Human Email', 'Agent', 'Model', 'Commits', 'Lines'],
      colWidths: [20, 20, 20, 8, 10],
      style: { head: ['green'], border: ['grey'] },
    });
    humanAiTable.push(['*', '*', '*', humanAiTotalCommits, humanAiTotalLines]);
    for (const stat of humanAiStats) {
      const displayAgent = stat.aiAgentName || stat.aiEmail;
      humanAiTable.push([stat.humanEmail, displayAgent, stat.aiModel || '-', stat.commits, stat.lines]);
    }
    this.context.stdout.write('=== Human + AI ===\n');
    this.context.stdout.write(humanAiTable.toString());
    this.context.stdout.write(`\nTotal: ${humanAiStats.length} human+AI pairs, ${humanAiTotalLines} lines\n`);
  }
}
