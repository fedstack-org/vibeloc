# vibeloc

> **Vibe** Check Your Code — Analyze the ratio of human vs AI-generated contributions in your repository.

<p align="center">
  <img src="https://img.shields.io/npm/v/vibeloc?color=6366f1&label=npm&style=flat-square" alt="npm version">
  <img src="https://img.shields.io/github/license/fedstack-org/vibeloc?color=6366f1&style=flat-square" alt="license">
  <img src="https://img.shields.io/node/vibeloc?color=6366f1&style=flat-square" alt="node">
</p>

## What is vibeloc?

**vibeloc** (Vibe LOC) analyzes your git history to quantify how much of your codebase was written by humans versus AI assistants like Claude Code, GitHub Copilot, Droid, and more.

Perfect for:
- 📊 **Metrics teams** tracking AI adoption
- 🔍 **Tech leads** auditing code authorship  
- 🎯 **Open source maintainers** understanding contribution patterns
- 💡 **Curious developers** seeing their "vibe rate"

## Quick Start

```bash
npx vibeloc@latest /path/to/your/repo
```

Or install globally:

```bash
npm install -g vibeloc
vibeloc /path/to/your/repo
```

## Example Output

```
Analyzing git history in: /your/repo

=== Human Only ===
┌─────────────────────────────────────────────┬──────────┬────────────┐
│ Email                                       │ Commits  │ Lines      │
├─────────────────────────────────────────────┼──────────┼────────────┤
│ john@example.com                            │ 142      │ 58934      │
│ jane@company.com                            │ 89       │ 32100      │
└─────────────────────────────────────────────┴──────────┴────────────┘
Total: 2 contributors, 91034 lines

=== AI ===
┌─────────────────────────┬─────────────────────────┬──────────┬────────────┐
│ Agent                   │ Model                   │ Commits  │ Lines      │
├─────────────────────────┼─────────────────────────┼──────────┼────────────┤
│ Claude Code             │ *                       │ 45       │ 28450      │
│                         │ Claude Opus 4.6         │ 42       │ 27100      │
│                         │ Claude Sonnet 4.6       │ 3        │ 1350       │
├─────────────────────────┼─────────────────────────┼──────────┼────────────┤
│ Droid                   │ *                       │ 28       │ 15420      │
├─────────────────────────┼─────────────────────────┼──────────┼────────────┤
│ GitHub Copilot         │ *                       │ 12       │ 4890       │
└─────────────────────────┴─────────────────────────┴──────────┴────────────┘
Total: 3 AI contributors, 48760 lines

=== Human + AI ===
┌────────────────────┬────────────────────┬────────────────────┬────────┬──────────┐
│ Human Email        │ Agent              │ Model              │ Commi… │ Lines    │
├────────────────────┼────────────────────┼────────────────────┼────────┼──────────┤
│ john@example.com  │ Claude Code        │ *                  │ 45     │ 28450    │
│                    │                    │ Claude Opus 4.6    │ 42     │ 27100    │
│                    │                    │ Claude Sonnet 4.6  │ 3      │ 1350     │
└────────────────────┴────────────────────┴────────────────────┴────────┴──────────┘
Total: 1 human+AI pairs, 28450 lines

=== Vibe Rate ===
┌─────────────────────────────────────────────┬───────────────┐
│ Email                                       │ Vibe Rate     │
├─────────────────────────────────────────────┼───────────────┤
│ *                                           │ 34.9%         │
├─────────────────────────────────────────────┼───────────────┤
│ john@example.com                            │ 34.9%         │
└─────────────────────────────────────────────┴───────────────┘
```

## Features

- 🤖 **AI Agent Detection** — Recognizes Claude Code, GitHub Copilot, Factory Droid, Google Jules
- 📈 **Model-Level Stats** — Drill down into specific AI models (e.g., Claude Opus vs Sonnet)
- 👥 **Human + AI Pairs** — See which humans work with which AI assistants
- 📊 **Vibe Rate** — Calculate the percentage of AI-generated code per contributor

## Supported AI Agents

| Agent | Detection Method |
|-------|------------------|
| Claude Code | `@anthropic.com` emails, `claude` in name |
| GitHub Copilot | `copilot@users.noreply.github.com` |
| Factory Droid | `factory-droid` in email/name |
| Google Jules | `google-labs-jules` in email/name |

## License

Licensed under [Apache-2.0](./LICENSE).
