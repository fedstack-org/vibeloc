import {Command, Option} from 'clipanion';
import Table from 'cli-table3';
import {getGitLog} from '../git/log';
import {getDiffStats} from '../git/diff';
import {HumanAIStats} from '../types';
import {collectContributionStats, AIStatsWithAgent} from '../stats';

export class AnalyzeCommand extends Command {
  static paths = [[]];

  repoPath = Option.String({required: false});

  async execute(): Promise<void> {
    const repoPath = this.repoPath || '.';

    this.context.stdout.write(`Analyzing git history in: ${repoPath}\n\n`);

    const commits = getGitLog(repoPath);
    const {
      humanStatsMap,
      aiStatsMap,
      humanAiStatsMap,
      botIgnoredMap,
    } = collectContributionStats(commits.map(commit => ({
      commit,
      lines: getDiffStats(repoPath, commit.hash).total,
    })));

    const humanStats = Array.from(humanStatsMap.values()).sort((left, right) => right.lines - left.lines || right.commits - left.commits || left.email.localeCompare(right.email));
    const aiStats = Array.from(aiStatsMap.values()).sort((left, right) => right.lines - left.lines || right.commits - left.commits || left.email.localeCompare(right.email));

    // Group AI stats by agent
    const aiByAgent = new Map<string, {total: {commits: number, lines: number}, models: AIStatsWithAgent[]}>();
    for (const stat of aiStats) {
      const agentKey = stat.agentName || stat.email;
      const existing = aiByAgent.get(agentKey) || {total: {commits: 0, lines: 0}, models: []};
      existing.total.commits += stat.commits;
      existing.total.lines += stat.lines;
      existing.models.push(stat);
      aiByAgent.set(agentKey, existing);
    }

    const humanAiStats = Array.from(humanAiStatsMap.values()).sort((left, right) => right.lines - left.lines || right.commits - left.commits || left.humanEmail.localeCompare(right.humanEmail) || (left.aiAgentName || left.aiEmail).localeCompare(right.aiAgentName || right.aiEmail));

    // Group Human+AI stats by human+agent
    const humanAiByPair = new Map<string, {total: {commits: number, lines: number}, entries: HumanAIStats[]}>();
    for (const stat of humanAiStats) {
      const pairKey = `${stat.humanEmail}|${stat.aiAgentName || stat.aiEmail}`;
      const existing = humanAiByPair.get(pairKey) || {total: {commits: 0, lines: 0}, entries: []};
      existing.total.commits += stat.commits;
      existing.total.lines += stat.lines;
      existing.entries.push(stat);
      humanAiByPair.set(pairKey, existing);
    }

    const humanTable = new Table({
      head: ['Email', 'Commits', 'Lines'],
      colWidths: [45, 10, 12],
      style: { head: ['cyan'], border: ['grey'] },
    });
    for (const stat of humanStats) {
      humanTable.push([stat.email, stat.commits, stat.lines]);
    }
    this.context.stdout.write('=== Human ===\n');
    this.context.stdout.write(humanTable.toString());
    this.context.stdout.write(`\nTotal: ${humanStats.length} contributors, ${humanStats.reduce((s, x) => s + x.lines, 0)} lines\n\n`);

    const aiTable = new Table({
      head: ['Agent', 'Model', 'Commits', 'Lines'],
      colWidths: [25, 25, 10, 12],
      style: { head: ['magenta'], border: ['grey'] },
    });
    for (const [agentName, group] of aiByAgent) {
      aiTable.push([agentName, '*', group.total.commits, group.total.lines]);
      for (const stat of group.models) {
        if (stat.model) {
          aiTable.push(['', stat.model, stat.commits, stat.lines]);
        }
      }
    }
    this.context.stdout.write('=== AI ===\n');
    this.context.stdout.write(aiTable.toString());
    const aiTotalLines = Array.from(aiByAgent.values()).reduce((s, g) => s + g.total.lines, 0);
    this.context.stdout.write(`\nTotal: ${aiByAgent.size} AI contributors, ${aiTotalLines} lines\n\n`);

    const humanAiTable = new Table({
      head: ['Human Email', 'Agent', 'Model', 'Commits', 'Lines'],
      colWidths: [20, 20, 20, 8, 10],
      style: { head: ['green'], border: ['grey'] },
    });
    for (const [pairKey, group] of humanAiByPair) {
      const [humanEmail, agentName] = pairKey.split('|');
      humanAiTable.push([humanEmail, agentName, '*', group.total.commits, group.total.lines]);
      for (const stat of group.entries) {
        if (stat.aiModel) {
          humanAiTable.push(['', '', stat.aiModel, stat.commits, stat.lines]);
        }
      }
    }
    this.context.stdout.write('=== Human + AI ===\n');
    this.context.stdout.write(humanAiTable.toString());
    const humanAiTotalLines = Array.from(humanAiByPair.values()).reduce((s, g) => s + g.total.lines, 0);
    this.context.stdout.write(`\nTotal: ${humanAiByPair.size} human+AI pairs, ${humanAiTotalLines} lines\n\n`);

    const totalHumanLines = humanStats.reduce((s, x) => s + x.lines, 0);
    const totalAiLines = aiTotalLines;
    const formatRate = (ai: number, human: number) => {
      if (human === 0) return ai === 0 ? '0.0%' : 'n/a';
      return `${(ai / human * 100).toFixed(1)}%`;
    };

    // Per-human AI lines
    const humanAiLinesByEmail = new Map<string, number>();
    for (const stat of humanAiStats) {
      const existing = humanAiLinesByEmail.get(stat.humanEmail) || 0;
      humanAiLinesByEmail.set(stat.humanEmail, existing + stat.lines);
    }

    const vibeTable = new Table({
      head: ['Email', 'Vibe Rate'],
      colWidths: [45, 15],
      style: { head: ['yellow'], border: ['grey'] },
    });
    vibeTable.push(['*', formatRate(totalAiLines, totalHumanLines)]);
    const allEmails = new Set([...humanStatsMap.keys(), ...humanAiLinesByEmail.keys()]);
    const vibeEntries = Array.from(allEmails).map(email => {
      const humanLines = humanStatsMap.get(email)?.lines || 0;
      const aiLines = humanAiLinesByEmail.get(email) || 0;
      return {
        email,
        rate: humanLines === 0 ? Number.POSITIVE_INFINITY : aiLines / humanLines,
        formatted: formatRate(aiLines, humanLines),
      };
    }).sort((left, right) => right.rate - left.rate || left.email.localeCompare(right.email));
    for (const entry of vibeEntries) {
      vibeTable.push([entry.email, entry.formatted]);
    }
    this.context.stdout.write('=== Vibe Rate (History, AI / Project Human LOC) ===\n');
    this.context.stdout.write(vibeTable.toString());
    this.context.stdout.write('\n');

    const botTotal = Array.from(botIgnoredMap.values()).reduce((s, x) => s + x, 0);
    this.context.stdout.write(`Ignored lines:\n  Bot: ${botTotal}\n`);
    for (const [email, count] of botIgnoredMap) {
      this.context.stdout.write(`    ${email}: ${count}\n`);
    }
    this.context.stdout.write('\n');
  }
}
