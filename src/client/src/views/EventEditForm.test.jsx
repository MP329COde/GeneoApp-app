import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { renderWithProviders, screen } from '../test/test-utils.jsx';
import { EventEditForm } from './EventEditForm.jsx';

const event = { id: 4, value: null, date_text: '1850', date_precision: 'ABOUT', place_id: 2 };
const places = [
  { id: 1, name: 'Lyon' },
  { id: 2, name: 'Paris' },
];

describe('EventEditForm', () => {
  it('renvoie les champs modifiés', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <EventEditForm
        event={event}
        places={places}
        precisions={['EXACT', 'ABOUT']}
        precisionKeys={{}}
        busy={false}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    const date = screen.getByLabelText('Date');
    await user.clear(date);
    await user.type(date, '12 mars 1850');
    await user.selectOptions(screen.getByLabelText('Précision de la date'), 'EXACT');
    await user.selectOptions(screen.getByLabelText('Lieu'), '1');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith({
      value: null,
      dateText: '12 mars 1850',
      datePrecision: 'EXACT',
      placeId: 1,
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
