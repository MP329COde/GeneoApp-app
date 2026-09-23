import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RichText } from './rich-text.jsx';

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
});
