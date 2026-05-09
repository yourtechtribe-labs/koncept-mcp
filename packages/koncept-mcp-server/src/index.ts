#!/usr/bin/env node
import { resolve } from 'node:path'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'
import { registerAllTools } from './tools/index.js'
import { registerAllResources } from './resources/index.js'

async function main(): Promise<void> {
  const rawRoot = process.argv[2] ?? process.cwd()
  const rootDir = resolve(rawRoot)

  const { mcp } = createServer({ rootDir })
  registerAllTools(mcp, { rootDir })
  registerAllResources(mcp, { rootDir })

  const transport = new StdioServerTransport()
  await mcp.connect(transport)
}

main().catch((err: unknown) => {
  process.stderr.write(`koncept-mcp-server fatal: ${String(err)}\n`)
  process.exit(1)
})
