// 대화에 쌓이는 줄(session.append) 하나 → 사무실이 알아듣는 이벤트 목록.
// 웹 화면의 server.js 가 jsonl 기록에서 하는 일과 같다.

export function oneLine(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(c => (typeof c === 'string' ? c : c && c.type === 'text' ? c.text : '')).join(' ');
}

// 시스템이 끼워 넣은 메시지(<system-reminder>, <command-name>, [Request interrupted…])는 사람이 쓴 말이 아니다.
const isHumanText = t => !!t && !/^\s*[<\[]/.test(t);
const base = p => (p ? String(p).split(/[\\/]/).filter(Boolean).pop() : '');

export function toolLabel(name, input) {
  const i = input || {};
  switch (name) {
    case 'Read': case 'NotebookRead': return '📖 ' + base(i.file_path || i.notebook_path);
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit': return '⌨️ ' + base(i.file_path || i.notebook_path);
    case 'Glob': case 'Grep': return '🔎 ' + oneLine(i.pattern, 28);
    case 'Bash': case 'PowerShell': return '$ ' + oneLine(i.command, 34);
    case 'WebSearch': return '🌐 ' + oneLine(i.query, 30);
    case 'WebFetch': try { return '🌐 ' + new URL(i.url).hostname; } catch { return '🌐 웹 페이지'; }
    case 'TodoWrite': return '🗒️ 할 일 정리';
    case 'EnterPlanMode': return '🗒️ 계획 세우는 중';
    case 'ExitPlanMode': return '🙋 계획 봐주세요';
    case 'AskUserQuestion': return '❓ ' + oneLine(i.questions && i.questions[0] && i.questions[0].question, 34);
    case 'Agent': case 'Task': return '📞 ' + (i.subagent_type || 'general-purpose') + ' 호출';
    case 'Skill': return '📘 ' + oneLine(i.skill, 24);
  }
  if (name.startsWith('mcp__')) return '🔌 ' + oneLine(name.split('__').pop(), 26);
  return '🔧 ' + name;
}

export function todosOf(name, input) {
  const list = (name === 'TodoWrite' && input && input.todos) || (/update_plan$/.test(name) && input && input.items) || null;
  if (!Array.isArray(list)) return null;
  return list.slice(0, 8).map(x => ({ t: oneLine(x.content || x.subject || '', 30), s: x.status || 'pending' }));
}

// message: { type, role, isMeta, content }, a: 'main' 또는 서브에이전트 id
export function rowEvents(message, a) {
  const out = [];
  if (!message || !Array.isArray(message.content) && typeof message.content !== 'string') return out;
  if (message.type === 'assistant' && Array.isArray(message.content)) {
    for (const b of message.content) {
      if (!b) continue;
      if (b.type === 'thinking') out.push({ k: 'think', a, text: oneLine(b.thinking, 90) });
      else if (b.type === 'text' && b.text && b.text.trim()) out.push({ k: 'say', a, text: oneLine(b.text, 90) });
      else if (b.type === 'tool_use') {
        out.push({ k: 'tool', a, id: b.id, tool: b.name, label: toolLabel(b.name, b.input) });
        const todos = todosOf(b.name, b.input);
        if (todos) out.push({ k: 'todos', a, items: todos });
      }
    }
  } else if (message.type === 'user' && !message.isMeta) {
    const c = message.content;
    if (typeof c === 'string') {
      if (a === 'main' && isHumanText(c)) out.push({ k: 'prompt', a, text: oneLine(c, 90) });
    } else {
      for (const b of c) {
        if (!b) continue;
        if (b.type === 'tool_result') out.push({ k: 'result', a, id: b.tool_use_id, err: !!b.is_error, text: b.is_error ? oneLine(textOf(b.content), 70) : '' });
        else if (b.type === 'text' && a === 'main' && isHumanText(b.text)) out.push({ k: 'prompt', a, text: oneLine(b.text, 90) });
      }
    }
  }
  return out;
}
