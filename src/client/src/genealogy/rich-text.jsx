// Texte riche des annotations : sous-ensemble Markdown converti en éléments
// React (jamais de HTML injecté). Gras **x**, italique *x*, lien [texte](https://…),
// listes « - », titres « ## », citations « > ».
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https:\/\/[^)\s]+\))/g;

function renderInline(text, keyPrefix) {
  return text.split(INLINE).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/.exec(part);
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

export function RichText({ text }) {
  const blocks = [];
  let list = null;
  String(text ?? '')
    .split('\n')
    .forEach((line, index) => {
      const item = /^\s*[-*]\s+(.*)$/.exec(line);
      if (item) {
        list ??= [];
        list.push(<li key={index}>{renderInline(item[1], index)}</li>);
        return;
      }
      if (list) {
        blocks.push(<ul key={`list-${index}`}>{list}</ul>);
        list = null;
      }
      if (line.trim() === '') return;
      const heading = /^#{1,3}\s+(.*)$/.exec(line);
      if (heading) {
        blocks.push(<h5 key={index}>{renderInline(heading[1], index)}</h5>);
        return;
      }
      const quote = /^>\s?(.*)$/.exec(line);
      if (quote) {
        blocks.push(<blockquote key={index}>{renderInline(quote[1], index)}</blockquote>);
        return;
      }
      blocks.push(<p key={index}>{renderInline(line, index)}</p>);
    });
  if (list) blocks.push(<ul key="list-end">{list}</ul>);
  return <div className="rich-text">{blocks}</div>;
}

/** Insère une mise en forme autour de la sélection d'une zone de texte. */
export function applyFormat(textarea, kind) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end) || 'texte';
  const formats = {
    bold: `**${selected}**`,
    italic: `*${selected}*`,
    list: selected
      .split('\n')
      .map((line) => `- ${line}`)
      .join('\n'),
    quote: `> ${selected}`,
    link: `[${selected}](https://)`,
  };
  return value.slice(0, start) + formats[kind] + value.slice(end);
}
