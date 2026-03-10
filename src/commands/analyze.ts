import {Command, Option} from 'clipanion';
import Table from 'cli-table3';
import {getGitLog, isAIEmail, isBotEmail, parseAgentInfo} from '../git/log';
import {getDiffStats} from '../git/diff';
import {ContributorStats, HumanAIStats} from '../types';

interface AIStatsWithAgent extends ContributorStats {
  agentName?: string;
  model?: string;
}

export class AnalyzeCommand extends Command {
  static paths = [[]];

  repoPath = Option.String({required: false});

  async execute(): Promise<void> {
    const repoPath = this.repoPath || '.';

    this.context.stdout.write(`Analyzing git history in: ${repoPath}\n\n`);

    const commits = getGitLog(repoPath);

    const humanStatsMap = new Map<string, ContributorStats>();
    const aiStatsMap = new Map<string, AIStatsWithAgent>();
    const humanAiStatsMap = new Map<string, HumanAIStats>();
    const botIgnoredMap = new Map<string, number>();

    for (const commit of commits) {
      const diffStats = getDiffStats(repoPath, commit.hash);
      const lines = diffStats.total;

      const coAuthorAis = commit.coAuthors.filter(ca => isAIEmail(ca.email));
      const humanEmail = commit.authorEmail;

      if (coAuthorAis.length === 0) {
        if (isAIEmail(humanEmail)) {
          const agentInfo = parseAgentInfo(commit.authorName, humanEmail);
          const aiKey = agentInfo?.agentName && agentInfo?.model
            ? `${agentInfo.agentName}|${agentInfo.model}`
            : (agentInfo?.agentName || humanEmail);
          const existingAi = aiStatsMap.get(aiKey) || {email: aiKey, commits: 0, lines: 0, agentName: agentInfo?.agentName, model: agentInfo?.model};
          existingAi.commits += 1;
          existingAi.lines += lines;
          if (agentInfo?.agentName) existingAi.agentName = agentInfo.agentName;
          if (agentInfo?.model) existingAi.model = agentInfo.model;
          aiStatsMap.set(aiKey, existingAi);
        } else if (isBotEmail(humanEmail)) {
          botIgnoredMap.set(humanEmail, (botIgnoredMap.get(humanEmail) || 0) + lines);
        } else {
          const key = humanEmail;
          const existing = humanStatsMap.get(key) || {email: key, commits: 0, lines: 0};
          existing.commits += 1;
          existing.lines += lines;
          humanStatsMap.set(key, existing);
        }
      } else {
        for (const ai of coAuthorAis) {
          const aiKey = ai.agentName && ai.model
            ? `${ai.agentName}|${ai.model}`
            : (ai.agentName || ai.email);
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

    const humanAiStats = Array.from(humanAiStatsMap.values()).sort((a, b) => b.lines - a.lines);

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
    this.context.stdout.write('=== Human Only ===\n');
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

    // Vibe Rate
    const totalHumanLines = humanStats.reduce((s, x) => s + x.lines, 0);
    const totalAiLines = aiTotalLines;
    const totalLines = totalHumanLines + totalAiLines;
    const formatRate = (ai: number, total: number) => total === 0 ? '0.0%' : `${(ai / total * 100).toFixed(1)}%`;

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
    vibeTable.push(['*', formatRate(totalAiLines, totalLines)]);
    const allEmails = new Set([...humanStatsMap.keys(), ...humanAiLinesByEmail.keys()]);
    const vibeEntries = Array.from(allEmails).map(email => {
      const humanLines = humanStatsMap.get(email)?.lines || 0;
      const aiLines = humanAiLinesByEmail.get(email) || 0;
      return { email, rate: aiLines / (humanLines + aiLines || 1), formatted: formatRate(aiLines, humanLines + aiLines) };
    }).sort((a, b) => b.rate - a.rate);
    for (const entry of vibeEntries) {
      vibeTable.push([entry.email, entry.formatted]);
    }
    this.context.stdout.write('=== Vibe Rate (History) ===\n');
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
