import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {displayLanguage} from '../../src/locale.js';

// Generated operator entry: fixed local binding, no shell interpolation or credential handling.
export function ownerEntry({cli,bindingFile,bundle,project,host,locale}) {
  const zh=displayLanguage(locale)==='zh';
  const help=zh
    ? '在独立的所有者终端中运行。\nnode owner.mjs doctor\nnode owner.mjs inspect --scope project\n查看 OPERATIONS.md 中的审阅、更正、遗忘和恢复步骤。\n'+(host==='codex'?'enable：显式修改本项目 Codex 配置；disable：撤销本接入包的修改。':'启用/停用请按 OPERATIONS.md 的宿主步骤执行。')
    : 'Run in a separate owner terminal.\nnode owner.mjs doctor\nnode owner.mjs inspect --scope project\nSee OPERATIONS.md for review, correction, forgetting and recovery.\n'+(host==='codex'?'enable: explicitly apply this project Codex configuration; disable: undo this bundle installation.':'Follow the host enable/disable steps in OPERATIONS.md.');
  return [
    "import fs from 'node:fs';",
    "import {connectCommand} from "+JSON.stringify(pathToFileURL(cli).href)+";",
    'const binding='+JSON.stringify(bindingFile)+';',
    'const bundle='+JSON.stringify(bundle)+';',
    'const target='+JSON.stringify(path.join(project,'.codex','config.toml'))+';',
    'const configDirectory='+JSON.stringify(path.join(project,'.codex'))+';',
    'const help='+JSON.stringify(help)+';',
    "const allowed=new Set(['doctor','inspect','review','explain','backup','restore-preview','restore-apply','review-preview','review-apply','forget-preview','forget-apply']);",
    "const [action,...args]=process.argv.slice(2);",
    'try {',
    "  if(action===undefined||action==='help') { if(args.length) throw new Error('help takes no options'); process.stdout.write(help+'\\n'); }",
    '  else {',
    '    let result;',
    "    if(action==='enable'||action==='disable') {",
    '      if('+JSON.stringify(host)+"!=='codex') throw new Error('Use the host enable/disable steps in OPERATIONS.md');",
    "      if(args.length) throw new Error('enable/disable takes no options');",
    "      try { const entry=fs.lstatSync(configDirectory); if(entry.isSymbolicLink()||!entry.isDirectory()) throw new Error('Project .codex must be a real directory; inspect its destination before applying'); } catch(error) { if(error.code!=='ENOENT') throw error; }",
    "      result=await connectCommand(action==='enable'?['apply','--bundle',bundle,'--target',target]:['undo','--bundle',bundle]);",
    '    } else {',
    "      if(!allowed.has(action)||args.includes('--binding')) throw new Error('Unsupported action or binding override; see OPERATIONS.md');",
    "      result=await connectCommand([action,...args,'--binding',binding]);",
    '    }',
    // Same display protection as the public owner CLI; the JSON value preserves source text.
    "    process.stdout.write(JSON.stringify(result,null,2).replace(/[\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069]/g,c=>'\\\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\\n');",
    '    if(result.ok===false) process.exitCode=1;',
    '  }',
    "} catch(error) {process.stderr.write(String(error.message)+'\\n');process.exitCode=1;}",
    '',
  ].join('\n');
}

export function operationsGuide({host,locale,bundle,project}) {
  const zh=displayLanguage(locale)==='zh';
  const quote=s=>process.platform==='win32'?"'"+s.replaceAll("'","''")+"'":"'"+s.replaceAll("'","'\\''")+"'";
  const dsh='dsh --profile headless --patch '+quote(path.join(bundle,'cordis.patch.yml'))+' '+quote(zh?'仅调用 mcp__persona_memory__memory_status 并报告结果，不保存新记忆。':'Call mcp__persona_memory__memory_status and report the result. Do not save new memory.');
  const common=[
    'node owner.mjs doctor',
    'node owner.mjs inspect --scope project --limit 20',
    'node owner.mjs inspect --scope project --candidate ACTUAL_ID',
    'node owner.mjs review --scope project --candidate ACTUAL_ID --revision 1 --decision accept',
  ];
  const forget=[
    'node owner.mjs explain --scope project --query language',
    'node owner.mjs forget-preview --scope project --memory ACTUAL_MEMORY_ID --revision 1 --out forget-plan.json',
    'node owner.mjs forget-apply --plan forget-plan.json',
  ];
  const recovery=[
    'node owner.mjs backup --out memory-backup.json',
    'node owner.mjs restore-preview --backup memory-backup.json --out restore-plan.json',
    'node owner.mjs restore-apply --backup memory-backup.json --plan restore-plan.json',
  ];
  const code=lines=>['~~~'+(process.platform==='win32'?'powershell':'sh'),...lines,'~~~',''].join('\n');
  if(zh) return [
    '# 本地接入与所有者管理','',
    '这是本机生成的接入包。先在本目录打开独立终端；以下管理命令不会要求模型 API Key。保留 Node、当前安装库和本目录的原位置。prepare 与 help 不启用宿主、不创建记忆数据。','',
    '## 启用与核对','',
    ...(host==='codex'?[
      '关闭正在编辑本项目配置的 Codex。确认只向以下项目配置追加 persona_memory 服务；不改全局配置或工作流文件：','',
      JSON.stringify(path.join(project,'.codex','config.toml')),'',
      code(['node owner.mjs enable']),
      '该命令显式应用配置并保存原字节恢复记录；已有同名服务会拒绝。把 WORKFLOW.md 的流程交给宿主遵循；不会自动写入 AGENTS.md。在受信任项目中重新打开 Codex，检查 /mcp 并实际调用 memory_status。配置解析不等于模型已经调用。','',
    ]:host==='dsh'?[
      '已验证入口是 DSH headless；桌面导入步骤尚未验收。先保留现有登录/官方 API 的宿主设置，不把 Key 写入本接入包。','',
      '在目标项目目录打开终端，以本次启动的临时 overlay 启动（需要已有 dsh 命令；不要在接入包目录启动项目任务）：','',
      code([dsh]),
      '启动后应看到 mcp__persona_memory__memory_status 等工具。让模型实际调用状态与检索，不能以“已记住”的文字回复代替调用证据。该命令未在生成时执行，不导入日常桌面 profile。','',
    ]:[
      '按 README.md 中的官方宿主来源启用生成的服务配置与 WORKFLOW.md。此宿主没有自动 enable/disable 操作；不把生成配置当成实际兼容认证。','',
    ]),
    '## 日常候选与更正','',
    '先 doctor，再看候选列表与详情。ACTUAL_ID 和 revision 必须来自当前详情；示例中的 1 不是永远有效。证据编号须自行核对，预检不代表批准。','',
    code(common),
    '如要拒绝候选，使用同一 review 命令，把 accept 改为 reject。更正由宿主提出同一 scope/kind/key 的新候选，独立审阅后，下次读取看到新值。capture 模式的模型没有审阅权限；不要让模型通过终端运行本管理入口绕过边界。若绑定没有 project 范围，改用 binding.json 中实际获准的别名。','',
    '## 遗忘与恢复','',
    '先 explain 找到正式记忆的 ID/revision，再预览删除影响。核对派生记忆、历史与候选影响后显式执行；变化或过期后重新预览，不能循环强试。','',
    code(forget),
    '完整备份包含私人数据。新文件必须尚不存在；恢复会替换当前库，先核对预览并另外保留当前数据备份。升级前保留旧 schema 备份，回退旧版本使用旧备份。','',
    code(recovery),
    '批量审阅可用 review-preview/review-apply；参数与现有 persona-memory-connect 命令一致，只省去 --binding。此入口固定本包绑定，不接受 --binding 重定向。','',
    '## 停用、重启与故障','',
    host==='codex'?'关闭当前会话后执行 node owner.mjs disable，再重开宿主。配置被后来编辑过时拒绝自动覆盖，检查 installation.json 并人工合并；不要强制恢复旧整份配置。撤销后若要再启用，准备新的接入包并显式复用原 storage 和逻辑身份，不对已撤销包反复 enable。':host==='dsh'?'停止本次 headless 进程，下次启动不带此 --patch。仅本次命令不会设置持久启用；如果另行手动导入了桌面 profile，须在该宿主撤下相应条目，不能用此处说明声称已经撤销。':'在宿主移除本服务条目，再重新建立会话；若用 connect apply 安装，按其受保护 undo 流程撤销。',
    '',
    '停用不会删除记忆、候选或备份；已进入旧对话上下文的内容不会随数据库遗忘而撤回。重新连接同一 binding/storage 可恢复正式记忆。路径/安装位置变化时重新生成接入包，不直接搬走后继续使用旧绝对路径。','',
    '缺少工具：检查宿主日志、Node/安装路径与信任设置；doctor 只检查本地库，不证明宿主已连接。写盘/冲突失败：保留原文件，停下检查与重启；损坏时对可信备份走预览恢复。不要删除库来“修复”，不要无限重试。宿主原生记忆与权限继续独立生效。','',
  ].join('\n');
  return [
    '# Local connection and owner operations','',
    'Open a separate owner terminal in this bundle directory. These management commands require no model API key. Keep Node, this installed library and this bundle at their original paths. Preparation/help enables no host and creates no memory store.','',
    '## Enable and verify','',
    ...(host==='codex'?[
      'Close any Codex process editing this project configuration. enable explicitly appends persona_memory only to this project file; no global configuration or workflow file is edited:','',JSON.stringify(path.join(project,'.codex','config.toml')),'',code(['node owner.mjs enable']),
      'Original bytes are saved privately for guarded undo. An existing declaration is refused. Provide WORKFLOW.md to the host; no AGENTS.md is automatically edited. Reopen Codex in the trusted project, check /mcp and actually call memory_status. Parsing alone is not model use.','',
    ]:host==='dsh'?[
      'The verified entry is DSH headless; desktop import is unverified. Keep provider authentication in the host, never in this bundle. From the target project directory, start one invocation with this overlay using an already installed dsh command:','',code([dsh]),
      'Check for mcp__persona_memory__memory_status and an actual status/recall call. Model prose is not tool evidence. Generation does not execute this command or import the everyday desktop profile.','',
    ]:['Enable the generated service and WORKFLOW.md using the official host reference in README.md. This host has no automatic enable/disable action; generated configuration is not host certification.','']),
    '## Review and correct','',
    'Run doctor, list pending candidates, inspect a real candidate, then explicitly decide. Replace ACTUAL_ID and example revision 1 with current values. Check evidence yourself; a preflight is not approval.','',code(common),
    'To reject, use the same review command with reject instead of accept. Corrections use a new host proposal for the same scope/kind/key, then separate owner review. The next recall sees the update. A capture Agent must not run this owner entry through shell tools. If project is not granted, use an actual binding scope alias.','',
    '## Forget and recover','',
    'Use explain to obtain the current memory ID/revision. Inspect the preview impact, then explicitly apply. Changed/expired plans require a fresh preview, never unlimited retries.','',code(forget),
    'Full backups are private. Output files must not already exist. Restore replaces the store: inspect the preview and separately back up current data first. Preserve an old-schema backup before upgrading; use that backup when rolling back.','',code(recovery),
    'Batch review uses review-preview/review-apply. Options match persona-memory-connect except --binding is fixed to this bundle and cannot be overridden.','',
    '## Disable, restart and failures','',
    host==='codex'?'Close the host session, run node owner.mjs disable, then reopen. Later edits cause undo to refuse; inspect installation.json and merge manually instead of forcing a whole-file restore. To enable again after undo, prepare a fresh bundle explicitly preserving the original storage and logical identity.':host==='dsh'?'Stop this headless process; omit --patch on the next launch. This one-invocation overlay does not persist enablement. A separately imported desktop profile must be removed in that host; these steps do not claim to undo it.':'Remove this service in the host and start a new session. If installed through connect apply, use its guarded undo flow.',
    '',
    'Disabling retains memories, candidates and backups. Forgetting does not retract content already in an old chat context. Reconnect with the same binding/storage for recovery. Regenerate after moving paths; existing absolute paths do not become portable.','',
    'Missing tools: inspect host logs, trust and Node/library paths. doctor checks only the local store, not host connectivity. On write/conflict errors preserve originals, inspect and restart. Use a trusted backup with restore preview if needed; do not delete the store or retry forever. Host-native memory and permissions remain separate.','',
  ].join('\n');
}
