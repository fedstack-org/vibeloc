#!/usr/bin/env node
import { Cli } from 'clipanion'
import { AnalyzeCommand } from './commands/analyze'

const [node, app, ...args] = process.argv

const cli = new Cli({
  binaryLabel: `vibeloc`,
  binaryName: `${node} ${app}`,
  binaryVersion: `1.0.0`
})

cli.register(AnalyzeCommand)
cli.runExit(args, {
  stdout: process.stdout,
  stderr: process.stderr
})
