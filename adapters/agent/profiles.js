// Configuration facts from vendor documentation, checked 2026-11-01.
// These profiles do not imply successful execution in the actual host.
const profile=(name,target,format,source)=>Object.freeze({name,target,format,source,checked:'2026-11-01',hostEndToEnd:false});
export const HOST_PROFILES=Object.freeze({
  codex:profile('Codex CLI / desktop local MCP','.codex/config.toml','toml','https://developers.openai.com/codex/mcp/'),
  dsh:profile('DeepSeek Harness','Cordis local bundle','cordis','https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md'),
  'claude-code':profile('Claude Code','.mcp.json','json-typed','https://code.claude.com/docs/en/mcp'),
  workbuddy:profile('WorkBuddy','Custom connector: import mcp.json','workbuddy','https://open.workbuddy.cn/docs/connector'),
  'gemini-cli':profile('Gemini CLI','.gemini/settings.json','json','https://geminicli.com/docs/tools/mcp-server/'),
  'qwen-code':profile('Qwen Code','.qwen/settings.json','json','https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/'),
  'kimi-code':profile('Kimi Code CLI','.kimi-code/mcp.json','json','https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html'),
  codebuddy:profile('CodeBuddy CLI','.mcp.json','json-typed','https://www.codebuddy.cn/docs/cli/mcp'),
  iflow:profile('iFlow CLI','.iflow/settings.json','json','https://docs.iflow.cn/cli/configuration/settings/'),
  'vscode-copilot':profile('VS Code Copilot Agent','.vscode/mcp.json','vscode','https://code.visualstudio.com/docs/agents/reference/mcp-configuration'),
  cursor:profile('Cursor','.cursor/mcp.json','json-typed','https://cursor.com/docs/mcp'),
});
export function hostConfiguration(host,{command,args}){
  const p=HOST_PROFILES[host];if(!Object.hasOwn(HOST_PROFILES,host))throw new TypeError('unknown host');
  const server={command,args:[...args]};
  if(p.format==='toml')return {filename:'config.toml',text:'[mcp_servers.persona_memory]\ncommand = '+JSON.stringify(command)+'\nargs = '+JSON.stringify(args)+'\n'};
  if(p.format==='cordis'){
    const quoted=JSON.stringify;
    return {filename:'cordis.patch.yml',text:'- insert:\n    - id: mcp-persona-memory\n      name: "@deepseek-ai/dsh-mcp-client"\n      config:\n        serverName: persona_memory\n        transport: stdio\n        command: '+quoted(command)+'\n        args: '+quoted(args)+'\n        toolCallTimeoutMs: 30000\n        failOnStartupError: false\n'};
  }
  const root=p.format==='vscode'?'servers':'mcpServers';
  if(['vscode','json-typed','workbuddy'].includes(p.format))server.type='stdio';
  return {filename:p.format==='workbuddy'?'mcp.json':'host-config.json',text:JSON.stringify({[root]:{persona_memory:server}},null,2)+'\n'};
}
