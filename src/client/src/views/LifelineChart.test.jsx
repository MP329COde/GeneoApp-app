import { describe, expect, it, vi } from 'vitest';
import { axe } from 'jest-axe';
import { fireEvent, renderWithProviders, screen } from '../test/test-utils.jsx';
import { LifelineChart } from './LifelineChart.jsx';

const ada = {
  personId: 1,
  role: 'PRINCIPAL',
  personGivenNames: 'Ada',
  personFamilyName: 'Lovelace',
};
const charles = {
  personId: 2,
  role: 'PRINCIPAL',
  personGivenNames: 'Charles',
  personFamilyName: 'Babbage',
};
const events = [
  { id: 1, type: 'BIRTH', date_text: '10 décembre 1815', participants: [ada] },
  { id: 2, type: 'MARRIAGE', date_text: 'vers 1835', participants: [ada, charles] },
  { id: 3, type: 'DEATH', date_text: '27 novembre 1852', participants: [ada] },
  { id: 4, type: 'BIRTH', date_text: 'avant 1795', participants: [charles] },
  { id: 5, type: 'OCCUPATION', date_text: '1840', participants: [charles] },
];
const persons = [
  { id: 1, is_living: 0 },
  { id: 2, is_living: 1 },
];

function renderChart(props = {}) {
  return renderWithProviders(
    <LifelineChart persons={persons} events={events} selectedId={null} now={2026} {...props} />,
  );
}

describe('LifelineChart', () => {
  it('rend un marqueur nommé par événement et par personne', () => {
    renderChart();
    expect(
      screen.getByRole('button', { name: 'Naissance, Ada Lovelace, 10 décembre 1815' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mariage, Ada Lovelace, vers 1835' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Mariage, Charles Babbage, vers 1835' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Naissance/ })).toHaveLength(2);
  });

  it('distingue les catégories par la forme, pas seulement par la couleur', () => {
    const { container } = renderChart();
    expect(container.querySelector('circle.lifeline__shape--birth')).toBeTruthy();
    expect(container.querySelector('rect.lifeline__shape--death')).toBeTruthy();
    expect(container.querySelector('polygon.lifeline__shape--marriage')).toBeTruthy();
    expect(container.querySelector('polygon.lifeline__shape--other')).toBeTruthy();
  });

  it('hachure les dates imprécises et ouvre la ligne des personnes vivantes', () => {
    const { container } = renderChart();
    expect(container.querySelectorAll('.lifeline__range').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.lifeline__range--open-before')).toBeTruthy();
    expect(container.querySelector('.lifeline__life--living')).toBeTruthy();
    expect(container.querySelector('.lifeline__arrow')).toBeTruthy();
    expect(screen.getByRole('group', { name: /Charles Babbage.*vivant/ })).toBeTruthy();
  });

  it('un clic sur un marqueur sélectionne la personne', () => {
    const onSelect = vi.fn();
    renderChart({ onSelect });
    fireEvent.click(screen.getByRole('button', { name: /Décès, Ada Lovelace/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('Entrée sélectionne, les flèches déplacent le focus entre marqueurs', () => {
    const onSelect = vi.fn();
    renderChart({ onSelect });
    const birth = screen.getByRole('button', { name: /Naissance, Charles/ });
    birth.focus();
    fireEvent.keyDown(birth, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(2);
    fireEvent.keyDown(birth, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Mariage, Charles/ }));
  });

  it('un seul marqueur est dans l’ordre de tabulation', () => {
    renderChart();
    const tabbable = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('tabindex') === '0');
    expect(tabbable.filter((b) => b.dataset.markerKey)).toHaveLength(1);
  });

  it('le zoom réduit la plage affichée', () => {
    renderChart();
    const before = screen.getByRole('status').textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Zoom +' }));
    expect(screen.getByRole('status').textContent).not.toBe(before);
  });

  it('affiche un message sans événement daté', () => {
    renderChart({ events: [] });
    expect(screen.getByText(/Aucun événement daté/)).toBeTruthy();
  });

  it('est accessible (axe) et traduit en anglais', async () => {
    const { container } = renderChart();
    expect(await axe(container)).toHaveNoViolations();
    renderWithProviders(
      <LifelineChart persons={persons} events={events} selectedId={1} now={2026} />,
      { locale: 'en' },
    );
    expect(screen.getAllByRole('button', { name: /Birth, Ada Lovelace/ }).length).toBeGreaterThan(
      0,
    );
  });
});
