import { describe, expect, it, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '../test/test-utils.jsx';
import { SiteSearch } from './SiteSearch.jsx';

const person = { id: 1, given_names: 'Jean', family_name: 'Dupont' };
const lifespan = { birthYear: 1800 };

describe('SiteSearch : noms des sites par défaut traduits', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('affiche le nom du site « Recherche web » en français', () => {
    renderWithProviders(<SiteSearch person={person} lifespan={lifespan} />, { locale: 'fr' });

    expect(screen.getByText('Recherche web')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retirer le site Recherche web' }),
    ).toBeInTheDocument();
  });

  it('affiche le nom du site « Recherche web » en anglais', () => {
    renderWithProviders(<SiteSearch person={person} lifespan={lifespan} />, { locale: 'en' });

    expect(screen.getByText('Web search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove the site Web search' })).toBeInTheDocument();
    expect(screen.queryByText('Recherche web')).not.toBeInTheDocument();
  });

  it('laisse le nom saisi par l’utilisateur intact', () => {
    localStorage.setItem(
      'geneoapp.searchSites',
      JSON.stringify([
        { id: 'site-1', name: 'Archives du Lot', template: 'https://x.fr/?q={nom}' },
      ]),
    );

    renderWithProviders(<SiteSearch person={person} lifespan={lifespan} />, { locale: 'en' });

    expect(screen.getByText('Archives du Lot')).toBeInTheDocument();
    expect(screen.queryByText('Web search')).not.toBeInTheDocument();
  });
});
