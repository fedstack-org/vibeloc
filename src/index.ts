#!/usr/bin/env node
import { Cli } from 'clipanion'
import { AnalyzeCommand } from './commands/analyze'
import { SnapshotCommand } from './commands/snapshot'

const [node, app, ...args] = process.argv

const cli = new Cli({
  binaryLabel: `vibeloc`,
  binaryName: `${node} ${app}`,
  binaryVersion: `1.0.12`
})

cli.register(AnalyzeCommand)
cli.register(SnapshotCommand)
cli.runExit(args, {
  stdout: process.stdout,
  stderr: process.stderr
})
