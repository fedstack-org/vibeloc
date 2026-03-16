import {Commit, ContributorStats, HumanAIStats, HumanHumanStats} from './types';
import {getAIKey, getCommitAttribution, getHumanPairKey, getHumanPairs} from './attribution';

export interface AIStatsWithAgent extends ContributorStats {
  agentName?: string;
  model?: string;
}

export interface CommitContribution {
  commit: Commit;
  lines: number;
}

export interface ContributionStats {
  humanStatsMap: Map<string, ContributorStats>;
  aiStatsMap: Map<string, AIStatsWithAgent>;
  humanAiStatsMap: Map<string, HumanAIStats>;
  humanHumanStatsMap: Map<string, HumanHumanStats>;
  botIgnoredMap: Map<string, number>;
}

export function collectContributionStats(contributions: Iterable<CommitContribution>): ContributionStats {
  const humanStatsMap = new Map<string, ContributorStats>();
  const aiStatsMap = new Map<string, AIStatsWithAgent>();
  const humanAiStatsMap = new Map<string, HumanAIStats>();
  const humanHumanStatsMap = new Map<string, HumanHumanStats>();
  const botIgnoredMap = new Map<string, number>();

  for (const {commit, lines} of contributions) {
    const attribution = getCommitAttribution(commit, lines);

    if (attribution.author.kind === 'bot' && attribution.humans.length === 0 && attribution.ais.length === 0) {
      botIgnoredMap.set(attribution.author.email, (botIgnoredMap.get(attribution.author.email) || 0) + lines);
      continue;
    }

    for (const allocation of attribution.humanLineAllocations) {
      const key = allocation.participant.email;
      const existing = humanStatsMap.get(key) || {email: key, commits: 0, lines: 0};
      existing.commits += 1;
      existing.lines += allocation.lines;
      humanStatsMap.set(key, existing);
    }

    for (const ai of attribution.ais) {
      const aiKey = getAIKey(ai);
      const existing = aiStatsMap.get(aiKey) || {
        email: aiKey,
        commits: 0,
        lines: 0,
        agentName: ai.agentName,
        model: ai.model,
      };
      existing.commits += 1;
      existing.lines += lines;
      if (ai.agentName) existing.agentName = ai.agentName;
      if (ai.model) existing.model = ai.model;
      aiStatsMap.set(aiKey, existing);

      for (const human of attribution.humans) {
        const pairKey = `${human.email}|${aiKey}`;
        const existingHumanAi = humanAiStatsMap.get(pairKey) || {
          humanEmail: human.email,
          aiEmail: aiKey,
          aiAgentName: ai.agentName,
          aiModel: ai.model,
          commits: 0,
          lines: 0,
        };
        existingHumanAi.commits += 1;
        existingHumanAi.lines += lines;
        humanAiStatsMap.set(pairKey, existingHumanAi);
      }
    }

    for (const [leftHuman, rightHuman] of getHumanPairs(attribution.humans)) {
      const pairKey = getHumanPairKey(leftHuman.email, rightHuman.email);
      const [humanAEmail, humanBEmail] = pairKey.split('|');
      const existingHumanHuman = humanHumanStatsMap.get(pairKey) || {
        humanAEmail,
        humanBEmail,
        commits: 0,
        lines: 0,
      };
      existingHumanHuman.commits += 1;
      existingHumanHuman.lines += lines;
      humanHumanStatsMap.set(pairKey, existingHumanHuman);
    }
  }

  return {
    humanStatsMap,
    aiStatsMap,
    humanAiStatsMap,
    humanHumanStatsMap,
    botIgnoredMap,
  };
}
