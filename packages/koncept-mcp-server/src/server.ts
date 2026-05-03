import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { VERSION } from '@yourtechtribe-labs/koncept-core'

export interface ServerOptions {
  rootDir: string
}

export function createServer(opts: ServerOptions): {
  mcp: McpServer
  rootDir: string
} {
  const mcp = new McpServer({
    name: 'koncepto',
    version: VERSION,
  })
  return { mcp, rootDir: opts.rootDir }
}
