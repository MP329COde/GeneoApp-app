import { describe, expect, it } from 'vitest';
import { closestNames, excerptParts, frequentFamilyNames, highlightParts } from './search-text.js';

describe('search-text', () => {
  it('surligne sans tenir compte des accents ni de la casse', () => {
    expect(highlightParts('Hélène Lefèvre', 'lefevre helene')).toEqual([
      { text: 'Hélène', match: true },
      { text: ' ', match: false },
      { text: 'Lefèvre', match: true },
    ]);
  });

  it('renvoie le texte tel quel sans correspondance', () => {
    expect(highlightParts('Jean', 'zzz')).toEqual([{ text: 'Jean', match: false }]);
    expect(highlightParts('Jean', '')).toEqual([{ text: 'Jean', match: false }]);
  });

  it('lit les crochets du moteur comme des termes trouvés', () => {
    expect(excerptParts('…acte de [Dupont] à Rouen', 'dupont')).toEqual([
      { text: '…acte de ', match: false },
      { text: 'Dupont', match: true },
      { text: ' à Rouen', match: false },
    ]);
  });

  it('propose des orthographes proches', () => {
    const persons = [
      { given_names: 'Jean', family_name: 'Dupont' },
      { given_names: 'Anne', family_name: 'Martin' },
    ];
    expect(closestNames('Dupond', persons)).toEqual(['Dupont']);
    expect(closestNames('xyz', persons)).toEqual([]);
    expect(frequentFamilyNames(persons)).toEqual(['Dupont', 'Martin']);
  });
});
