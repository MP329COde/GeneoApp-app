import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startTestServer, requestJson } from './helpers.js';

async function createPerson(baseUrl, givenNames) {
  const response = await requestJson(baseUrl, '/api/persons', {
    method: 'POST',
    body: { givenNames, familyName: 'Dupont' },
  });
  return response.body.id;
}

async function addParentage(baseUrl, childId, parentId) {
  const response = await requestJson(baseUrl, '/api/parentages', {
    method: 'POST',
    body: { childId, parentId },
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
    assert.deepEqual(timeline.body, [
      { personId: person, code: 'BIRTH_AFTER_DEATH', severity: 'CERTAIN' },
    ]);
  } finally {
    await server.close();
  }
});
