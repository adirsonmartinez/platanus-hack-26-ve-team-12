// What a question to the agent wants, decided by its words (no model): 'explain' (to understand: the
// agent only reads and explains, and no repair is offered after), 'change' (fix, change, add, check
// security) or 'other'. Anything that mentions a change or a risk is never 'explain'. Pure.
const CHANGE = /\b(arregl\w*|repar\w*|corrig\w*|cambi\w*|modific\w*|agreg\w*|añad\w*|a[ñn]ade\w*|crea\w*|borr\w*|elimin\w*|quit\w*|actualiz\w*|mejor\w*|implement\w*|escrib\w*|instal\w*|haz|hazlo|seguro|segura|riesgo\w*|vulnerab\w*|audit\w*|revis\w*)\b/i;
const EXPLAIN = /\b(expl[ií]c\w*|explicar\w*|entender|entiendo|cu[ée]ntame|qu[ée] (es|son|hay|hace|hacen|significa)|para qu[ée] sirve\w*|c[óo]mo funciona\w*|de qu[ée] trata|d[óo]nde est[áa])\b/i;

export function questionIntent(text) {
  const t = String(text ?? '');
  if (CHANGE.test(t)) return 'change';
  if (EXPLAIN.test(t)) return 'explain';
  return 'other';
}
