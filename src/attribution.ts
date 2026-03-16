import {Commit} from './types';
import {isAIEmail, isBotEmail, parseAgentInfo} from './git/log';

export interface CommitParticipant {
  name: string;
  email: string;
  kind: 'human' | 'ai' | 'bot';
  agentName?: string;
  model?: string;
}

export interface HumanLineAllocation {
  participant: CommitParticipant;
  lines: number;
}

export interface CommitAttribution {
  author: CommitParticipant;
  humans: CommitParticipant[];
  ais: CommitParticipant[];
  bots: CommitParticipant[];
  humanLineAllocations: HumanLineAllocation[];
}

export function getAIKey(participant: Pick<CommitParticipant, 'email' | 'agentName' | 'model'>): string {
  if (participant.agentName && participant.model) {
    return `${participant.agentName}|${participant.model}`;
  }

  return participant.agentName || participant.email;
}

export function getCommitAttribution(commit: Commit, totalLines: number): CommitAttribution {
  const rawParticipants = [
    {name: commit.authorName, email: commit.authorEmail},
    ...commit.coAuthors.map(coAuthor => ({name: coAuthor.name, email: coAuthor.email})),
  ];

  const humans: CommitParticipant[] = [];
  const ais: CommitParticipant[] = [];
  const bots: CommitParticipant[] = [];
  const humanSeen = new Set<string>();
  const aiSeen = new Set<string>();
  const botSeen = new Set<string>();

  const classifiedParticipants = rawParticipants.map(rawParticipant => classifyParticipant(rawParticipant.name, rawParticipant.email));
  const [author] = classifiedParticipants;

  for (const participant of classifiedParticipants) {
    if (participant.kind === 'human') {
      if (!humanSeen.has(participant.email)) {
        humanSeen.add(participant.email);
        humans.push(participant);
      }
      continue;
    }

    if (participant.kind === 'ai') {
      const aiKey = getAIKey(participant);
      if (!aiSeen.has(aiKey)) {
        aiSeen.add(aiKey);
        ais.push(participant);
      }
      continue;
    }

    if (!botSeen.has(participant.email)) {
      botSeen.add(participant.email);
      bots.push(participant);
    }
  }

  return {
    author,
    humans,
    ais,
    bots,
    humanLineAllocations: splitHumanLines(humans, totalLines),
  };
}

function classifyParticipant(name: string, email: string): CommitParticipant {
  const normalizedEmail = email.trim().toLowerCase();
  const agentInfo = parseAgentInfo(name, normalizedEmail);

  if (agentInfo || isAIEmail(normalizedEmail)) {
    return {
      name: name.trim(),
      email: normalizedEmail,
      kind: 'ai',
      agentName: agentInfo?.agentName,
      model: agentInfo?.model,
    };
  }

  if (isBotEmail(normalizedEmail) || isBotEmail(name)) {
    return {
      name: name.trim(),
      email: normalizedEmail,
      kind: 'bot',
    };
  }

  return {
    name: name.trim(),
    email: normalizedEmail,
    kind: 'human',
  };
}

function splitHumanLines(participants: CommitParticipant[], totalLines: number): HumanLineAllocation[] {
  if (participants.length === 0 || totalLines <= 0) {
    return participants.map(participant => ({participant, lines: 0}));
  }

  const baseLines = Math.floor(totalLines / participants.length);
  const remainder = totalLines % participants.length;

  return participants.map((participant, index) => ({
    participant,
    lines: baseLines + (index < remainder ? 1 : 0),
  }));
}
