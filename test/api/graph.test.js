import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer, requestJson } from './helpers.js';

async function createPerson(baseUrl, givenNames, sex) {
  const response = await requestJson(baseUrl, '/api/persons', {
    method: 'POST',
    body: { givenNames, familyName: 'Dupont', ...(sex ? { sex } : {}) },
  });
  return response.body.id;
}

async function addParentage(baseUrl, childId, parentId, parentRole) {
  const response = await requestJson(baseUrl, '/api/parentages', {
    method: 'POST',
    body: { childId, parentId, ...(parentRole ? { parentRole } : {}) },
  });
  assert.equal(response.status, 201);
}

test('le graphe retourne ancêtres, descendants, fratrie et conjoints', async () => {
  const server = await startTestServer();
  try {
    const grandParent = await createPerson(server.baseUrl, 'Grand-parent');
    const parent = await createPerson(server.baseUrl, 'Parent');
    const child = await createPerson(server.baseUrl, 'Enfant');
    const sibling = await createPerson(server.baseUrl, 'Fratrie');
    const spouse = await createPerson(server.baseUrl, 'Conjoint');
    await addParentage(server.baseUrl, parent, grandParent);
    await addParentage(server.baseUrl, child, parent);
    await addParentage(server.baseUrl, sibling, parent);
    await requestJson(server.baseUrl, '/api/unions', {
      method: 'POST',
      body: { partnerIds: [child, spouse] },
    });

    const ancestors = await requestJson(server.baseUrl, `/api/persons/${child}/ancestors`);
    assert.deepEqual(
      ancestors.body.map((person) => person.id),
      [parent, grandParent],
    );

    const descendants = await requestJson(
      server.baseUrl,
      `/api/persons/${grandParent}/descendants`,
    );
    assert.deepEqual(
      descendants.body.map((person) => person.id),
      [parent, child, sibling],
    );

    const relations = await requestJson(server.baseUrl, `/api/persons/${child}/relations`);
    assert.equal(relations.body.parents[0].id, parent);
    assert.equal(relations.body.siblings[0].id, sibling);
    assert.equal(relations.body.spouses[0].id, spouse);

    const shallowAncestors = await requestJson(
      server.baseUrl,
      `/api/persons/${child}/ancestors?depth=1`,
    );
    assert.deepEqual(
      shallowAncestors.body.map((person) => person.id),
      [parent],
    );

    const shallowDescendants = await requestJson(
      server.baseUrl,
      `/api/persons/${grandParent}/descendants?depth=1`,
    );
    assert.deepEqual(
      shallowDescendants.body.map((person) => person.id),
      [parent],
    );

    const invalidDepth = await requestJson(
      server.baseUrl,
      `/api/persons/${child}/ancestors?depth=-1`,
    );
    assert.equal(invalidDepth.status, 400);
  } finally {
    await server.close();
  }
});

test('le graphe calcule le chemin, les ancêtres communs et la relation', async () => {
  const server = await startTestServer();
  try {
    const ancestor = await createPerson(server.baseUrl, 'Ancêtre');
    const parentA = await createPerson(server.baseUrl, 'Parent A');
    const parentB = await createPerson(server.baseUrl, 'Parent B');
    const personA = await createPerson(server.baseUrl, 'Personne A');
    const personB = await createPerson(server.baseUrl, 'Personne B');
    await addParentage(server.baseUrl, parentA, ancestor);
    await addParentage(server.baseUrl, parentB, ancestor);
    await addParentage(server.baseUrl, personA, parentA);
    await addParentage(server.baseUrl, personB, parentB);

    const common = await requestJson(
      server.baseUrl,
      `/api/graph/common-ancestors?personA=${personA}&personB=${personB}`,
    );
    assert.equal(common.body.length, 1);
    assert.equal(common.body[0].person.id, ancestor);

    const relationship = await requestJson(
      server.baseUrl,
      `/api/graph/relationship?personA=${personA}&personB=${personB}`,
    );
    assert.equal(relationship.body.relationship, 'COLLATERAL');
    assert.equal(relationship.body.distance, 4);
    assert.equal(relationship.body.path[0].personId, personA);
    assert.equal(relationship.body.path.at(-1).personId, personB);
    assert.equal(relationship.body.label, 'cousin germain ou cousine germaine');
  } finally {
    await server.close();
  }
});

test('le graphe distingue la branche paternelle de la branche maternelle', async () => {
  const server = await startTestServer();
  try {
    const father = await createPerson(server.baseUrl, 'Père');
    const mother = await createPerson(server.baseUrl, 'Mère');
    const child = await createPerson(server.baseUrl, 'Enfant');
    await addParentage(server.baseUrl, child, father, 'FATHER');
    await addParentage(server.baseUrl, child, mother, 'MOTHER');

    const paternal = await requestJson(
      server.baseUrl,
      `/api/graph/relationship?personA=${child}&personB=${father}`,
    );
    assert.equal(paternal.body.relationship, 'ANCESTOR_1');
    assert.equal(paternal.body.branch, 'PATERNAL');

    const maternal = await requestJson(
      server.baseUrl,
      `/api/graph/relationship?personA=${child}&personB=${mother}`,
    );
    assert.equal(maternal.body.relationship, 'ANCESTOR_1');
    assert.equal(maternal.body.branch, 'MATERNAL');

    const reverse = await requestJson(
      server.baseUrl,
      `/api/graph/relationship?personA=${father}&personB=${child}`,
    );
    assert.equal(reverse.body.relationship, 'DESCENDANT_1');
    assert.equal(reverse.body.branch, 'PATERNAL');
  } finally {
    await server.close();
  }
});

test('le graphe détecte une incohérence de chronologie', async () => {
  const server = await startTestServer();
  try {
    const person = await createPerson(server.baseUrl, 'Chronologie');
    const birth = await requestJson(server.baseUrl, '/api/events', {
      method: 'POST',
      body: {
        type: 'BIRTH',
        dateText: '2000',
        participants: [{ personId: person, role: 'PRINCIPAL' }],
      },
    });
    assert.equal(birth.status, 201);
    const death = await requestJson(server.baseUrl, '/api/events', {
      method: 'POST',
      body: {
        type: 'DEATH',
        dateText: '1900',
        participants: [{ personId: person, role: 'PRINCIPAL' }],
      },
    });
    assert.equal(death.status, 201);

    const timeline = await requestJson(server.baseUrl, '/api/graph/timeline');
    assert.deepEqual(
      timeline.body.map(({ personId, code, severity }) => ({ personId, code, severity })),
      [{ personId: person, code: 'BIRTH_AFTER_DEATH', severity: 'CERTAIN' }],
    );
    assert.match(timeline.body[0].message, /Naissance postérieure au décès/);
  } finally {
    await server.close();
  }
});

test('le graphe nomme le degré de parenté en français (fratrie, oncle/tante, neveu/nièce)', async () => {
  const server = await startTestServer();
  try {
    const grandParent = await createPerson(server.baseUrl, 'Aïeul');
    const parent = await createPerson(server.baseUrl, 'Parent', 'F');
    const auntOrUncle = await createPerson(server.baseUrl, 'Fratrie du parent', 'M');
    const child = await createPerson(server.baseUrl, 'Enfant', 'F');
    const nieceOrNephew = await createPerson(server.baseUrl, 'Neveu', 'M');
    await addParentage(server.baseUrl, parent, grandParent);
    await addParentage(server.baseUrl, auntOrUncle, grandParent);
    await addParentage(server.baseUrl, child, parent);
    await addParentage(server.baseUrl, nieceOrNephew, auntOrUncle);

    const siblingRelationship = await requestJson(
      server.baseUrl,
      `/api/graph/relationship?personA=${parent}&personB=${auntOrUncle}`,
    );
    assert.equal(siblingRelationship.body.relationship, 'COLLATERAL');
    assert.equal(siblingRelationship.body.label, 'frère');

    const uncleRelationship = await requestJson(
      server.baseUrl,
      `/api/graph/relationship?personA=${child}&personB=${auntOrUncle}`,
    );
    assert.equal(uncleRelationship.body.label, 'oncle');

    const nephewRelationship = await requestJson(
      server.baseUrl,
      `/api/graph/relationship?personA=${auntOrUncle}&personB=${child}`,
    );
    assert.equal(nephewRelationship.body.label, 'nièce');

    const cousinsRelationship = await requestJson(
      server.baseUrl,
      `/api/graph/relationship?personA=${child}&personB=${nieceOrNephew}`,
    );
    assert.equal(cousinsRelationship.body.label, 'cousin germain');

    const ancestorRelationship = await requestJson(
      server.baseUrl,
      `/api/graph/relationship?personA=${child}&personB=${grandParent}`,
    );
    assert.equal(ancestorRelationship.body.label, 'grand-parent');
  } finally {
    await server.close();
  }
});

test('GET /api/persons/:id/network renvoie le réseau typé jusqu’à la profondeur demandée', async () => {
  const server = await startTestServer();
  try {
    const person = async (givenNames) =>
      (
        await requestJson(server.baseUrl, '/api/persons', {
          method: 'POST',
          body: { givenNames, familyName: 'Réseau' },
        })
      ).body.id;
    const [moi, pere, grandPere, epouse, adopte] = [
      await person('Moi'),
      await person('Père'),
      await person('Grand-père'),
      await person('Épouse'),
      await person('Adopté'),
    ];
    const link = (childId, parentId, extra = {}) =>
      requestJson(server.baseUrl, '/api/parentages', {
        method: 'POST',
        body: { childId, parentId, parentRole: 'PARENT', ...extra },
      });
    await link(moi, pere);
    await link(pere, grandPere);
    await link(adopte, moi, { linkType: 'ADOPTIVE' });
    await requestJson(server.baseUrl, '/api/unions', {
      method: 'POST',
      body: { type: 'MARRIAGE', partnerIds: [moi, epouse] },
    });

    const near = (await requestJson(server.baseUrl, `/api/persons/${moi}/network?depth=1`)).body;
    assert.deepEqual(
      near.nodes.map((node) => node.id).sort((a, b) => a - b),
      [moi, pere, epouse, adopte].sort((a, b) => a - b),
    );
    assert.ok(near.edges.some((edge) => edge.kind === 'SPOUSE'));
    assert.ok(near.edges.some((edge) => edge.linkType === 'ADOPTIVE' && edge.to === adopte));

    const far = (await requestJson(server.baseUrl, `/api/persons/${moi}/network?depth=2`)).body;
    assert.equal(far.nodes.find((node) => node.id === grandPere).distance, 2);
    const bad = await requestJson(server.baseUrl, `/api/persons/${moi}/network?depth=9`);
    assert.equal(bad.status, 400);
  } finally {
    await server.close();
  }
});
