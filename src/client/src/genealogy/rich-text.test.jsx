import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RichText, applyFormat } from './rich-text.jsx';
import { translate } from '../design-system/i18n/I18nProvider.jsx';

const tFr = (key, variables, fallback) => translate('fr', key, variables, fallback);
const tEn = (key, variables, fallback) => translate('en', key, variables, fallback);

describe('RichText', () => {
  it('met en forme sans jamais injecter de HTML', () => {
    const { container } = render(
      <RichText
        text={
          '## Hypothèse\nNé **à Nantes**, *vers* 1812\n- acte 1\n- acte 2\n> « le troisième jour »\n<img src=x onerror=alert(1)>\n[AD44](https://archives.loire-atlantique.fr) [piège](javascript:alert(1))'
        }
      />,
    );
    expect(container.querySelector('h5').textContent).toBe('Hypothèse');
    expect(container.querySelector('strong').textContent).toBe('à Nantes');
    expect(container.querySelector('em').textContent).toBe('vers');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('blockquote')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://archives.loire-atlantique.fr');
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('met en forme la sélection quand elle existe', () => {
    const textarea = { selectionStart: 0, selectionEnd: 12, value: 'Ada Lovelace' };

    expect(applyFormat(textarea, 'bold', tFr)).toBe('**Ada Lovelace**');
  });

  it('utilise le mot traduit quand aucune sélection n’est faite', () => {
    const textarea = { selectionStart: 0, selectionEnd: 0, value: '' };

    expect(applyFormat(textarea, 'bold', tFr)).toBe('**texte**');
    expect(applyFormat(textarea, 'bold', tEn)).toBe('**text**');
  });
});
