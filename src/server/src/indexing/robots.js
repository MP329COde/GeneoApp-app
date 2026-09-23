// Lecture minimale de robots.txt : groupes « User-agent », règles Allow /
// Disallow (préfixes, « * » et « $ »), Crawl-delay. La règle la plus longue
// l'emporte ; à égalité, Allow l'emporte (usage courant).

export const USER_AGENT = 'GeneoApp-Indexer';

function toPattern(rule) {
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, (char) => (char === '$' ? char : `\\${char}`));
  const regex = escaped.replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$');
  return new RegExp(`^${regex}`);
}

export function parseRobots(text, agent = USER_AGENT) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [field, ...rest] = line.split(':');
    const key = field.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) {
        current = { agents: [], rules: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if ((key === 'allow' || key === 'disallow') && value) {
      current.rules.push({
        allow: key === 'allow',
        length: value.length,
        pattern: toPattern(value),
      });
    } else if (key === 'crawl-delay' && Number.isFinite(Number(value))) {
      current.delay = Number(value);
    }
  }
  const lower = agent.toLowerCase();
  const group = groups.find((candidate) =>
    candidate.agents.some((name) => name !== '*' && lower.includes(name)),
  ) ??
    groups.find((candidate) => candidate.agents.includes('*')) ?? { rules: [], delay: null };
  return {
    crawlDelaySeconds: group.delay,
    isAllowed(pathname) {
      let verdict = { allow: true, length: -1 };
      for (const rule of group.rules) {
        if (
          rule.pattern.test(pathname) &&
          (rule.length > verdict.length || (rule.length === verdict.length && rule.allow))
        ) {
          verdict = rule;
        }
      }
      return verdict.allow;
    },
  };
}
