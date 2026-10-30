import { IdentifiersPanel } from './IdentifiersPanel.jsx';
import { MediaLinksPanel } from './MediaLinksPanel.jsx';
import { EventEditForm } from './EventEditForm.jsx';
import { CitationEditForm } from './CitationEditForm.jsx';
import { AssertionsPanel } from './AssertionsPanel.jsx';
import { PlaceHistoryPanel } from './PlaceHistoryPanel.jsx';

// Clients factices : aucune requête, des données d'exemple clairement fictives.
const resolved = (value) => async () => value;
const noop = async () => ({});

const identifiersClient = {
  persons: {
    listIdentifiers: resolved([{ id: 1, scheme: 'WIKIDATA', value: 'Q-EXEMPLE' }]),
    addIdentifier: noop,
    removeIdentifier: noop,
  },
};
const emptyIdentifiersClient = {
  persons: { ...identifiersClient.persons, listIdentifiers: resolved([]) },
};

const assertion = (id, value, status) => ({
  id,
  field: 'birth_date',
  value,
  status,
  proof_level: 'POSSIBLE',
  reasoning: null,
  support: { citations: 1, independentSources: 1, suggestedProofLevel: 'POSSIBLE' },
});
const assertionsClient = {
  assertions: {
    list: resolved([
      assertion(1, '3 mars 1815', 'ACCEPTED'),
      assertion(2, '5 mars 1815', 'PROPOSED'),
    ]),
    conflicts: resolved([{ field: 'birth_date', assertions: [] }]),
    create: noop,
    accept: noop,
    reject: noop,
    reopen: noop,
    update: noop,
    remove: noop,
  },
  sources: {
    list: resolved([{ id: 1, title: 'Registre paroissial (exemple)' }]),
    addCitation: noop,
  },
};

const persons = [{ id: 1, given_names: 'Ada', family_name: 'Exemple' }];
const mediaClient = {
  media: {
    listLinks: resolved([{ id: 1, entityType: 'PERSON', entityId: 1, role: 'SUBJECT' }]),
    addLink: noop,
    removeLink: noop,
  },
};

const placesClient = {
  places: {
    listNames: resolved([
      { id: 1, name: 'Ancien nom', language: 'fr', validFromYear: 1700, validToYear: 1800 },
    ]),
    listParents: resolved([]),
    addName: noop,
    removeName: noop,
    addParent: noop,
    removeParent: noop,
    resolve: resolved({ fullName: 'Lieu, Région (exemple)' }),
  },
};

export default { title: 'Écrans/Panneaux' };

export const Identifiants = {
  render: () => <IdentifiersPanel client={identifiersClient} personId={1} />,
};
export const IdentifiantsVide = {
  render: () => <IdentifiersPanel client={emptyIdentifiersClient} personId={1} />,
};
export const AffirmationsEnContradiction = {
  render: () => <AssertionsPanel client={assertionsClient} entityType="PERSON" entityId={1} />,
};
export const LiensDeMedia = {
  render: () => <MediaLinksPanel client={mediaClient} mediaId={1} persons={persons} />,
};
export const HistoireDUnLieu = {
  render: () => (
    <PlaceHistoryPanel
      client={placesClient}
      places={[
        { id: 1, name: 'Lieu exemple' },
        { id: 2, name: 'Région exemple' },
      ]}
    />
  ),
};
export const ModificationEvenement = {
  render: () => (
    <EventEditForm
      event={{ id: 1, value: null, date_text: '1850', date_precision: 'ABOUT', place_id: null }}
      places={[{ id: 1, name: 'Lieu exemple' }]}
      precisions={['EXACT', 'ABOUT', 'BEFORE', 'AFTER']}
      precisionKeys={{}}
      busy={false}
      onSave={() => {}}
      onCancel={() => {}}
    />
  ),
};
export const ModificationCitation = {
  render: () => (
    <CitationEditForm
      citation={{ id: 1, page: '12', confidence: 'MEDIUM' }}
      source={{ title: 'Registre (exemple)', author: null, source_kind: 'ORIGINAL' }}
      busy={false}
      onSave={() => {}}
      onCancel={() => {}}
    />
  ),
};
