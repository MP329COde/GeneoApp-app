import {
  assertValid,
  required,
  isString,
  maxLength,
  oneOf,
  isInteger,
  isFiniteNumber,
  isBoolean,
  isArray,
  isPlainObject,
} from './validators.js';
import { ValidationError, fieldError } from '../errors.js';

const SEX_VALUES = ['M', 'F', 'U'];
const EVENT_TYPES = [
  'BIRTH',
  'DEATH',
  'MARRIAGE',
  'DIVORCE',
  'BAPTISM',
  'BURIAL',
  'ADOPTION',
  'OCCUPATION',
  'RESIDENCE',
  'EMIGRATION',
  'IMMIGRATION',
  'MIGRATION',
  'CENSUS',
  'MILITARY',
  'GRADUATION',
  'WILL',
  'PROBATE',
  'SUCCESSION',
  'RELIGIOUS_EVENT',
  'RELIGIOUS_COMMITMENT',
  'NATURALIZATION',
  'OTHER',
];
const DATE_PRECISIONS = [
  'EXACT',
  'ABOUT',
  'ESTIMATED',
  'CALCULATED',
  'BEFORE',
  'AFTER',
  'BETWEEN',
  'UNKNOWN',
];
const PARTICIPANT_ROLES = [
  'PRINCIPAL',
  'PARTNER1',
  'PARTNER2',
  'WITNESS',
  'OFFICIANT',
  'FATHER',
  'MOTHER',
  'CHILD',
  'GODPARENT',
  'INFORMANT',
  'GUARDIAN',
  'HEIR',
  'OTHER',
];
const UNION_TYPES = ['MARRIAGE', 'CIVIL_PARTNERSHIP', 'COHABITATION', 'OTHER'];
const PARENT_ROLES = ['FATHER', 'MOTHER', 'PARENT'];
const LINK_TYPES = ['BIOLOGICAL', 'ADOPTIVE', 'FOSTER', 'STEP', 'GUARDIAN', 'UNKNOWN'];
const ENTITY_TYPES = ['PERSON', 'EVENT', 'UNION', 'PARENTAGE'];
const CONFIDENCE_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];
const MEDIA_ENTITY_TYPES = ['PERSON', 'EVENT', 'UNION', 'PARENTAGE', 'SOURCE'];
const SEARCH_ENTITY_TYPES = ['PERSON', 'PLACE', 'EVENT', 'SOURCE', 'MEDIA'];

export function assertId(value, label = 'id') {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${label} doit être un identifiant entier positif`, {
      code: 'INVALID_ID',
      translationKey: 'server.validation.invalidId',
      variables: { field: label },
    });
  }
}

const PERSON_IDENTITY_FIELDS = [
  'givenNames',
  'familyName',
  'birthFamilyName',
  'sex',
  'notes',
  'nickname',
  'alias',
  'marriedName',
  'title',
  'suffix',
  'isLiving',
  'isPrivate',
  'externalId',
];

function validatePersonIdentityFields({
  birthFamilyName,
  sex,
  notes,
  nickname,
  alias,
  marriedName,
  title,
  suffix,
  isLiving,
  isPrivate,
  externalId,
}) {
  assertValid({
    birthFamilyName: [
      isString(birthFamilyName, 'birthFamilyName'),
      maxLength(birthFamilyName, 200, 'birthFamilyName'),
    ],
    sex: [oneOf(sex, SEX_VALUES, 'sex')],
    notes: [isString(notes, 'notes'), maxLength(notes, 5000, 'notes')],
    nickname: [isString(nickname, 'nickname'), maxLength(nickname, 200, 'nickname')],
    alias: [isString(alias, 'alias'), maxLength(alias, 200, 'alias')],
    marriedName: [isString(marriedName, 'marriedName'), maxLength(marriedName, 200, 'marriedName')],
    title: [isString(title, 'title'), maxLength(title, 100, 'title')],
    suffix: [isString(suffix, 'suffix'), maxLength(suffix, 50, 'suffix')],
    isLiving: [isBoolean(isLiving, 'isLiving')],
    isPrivate: [isBoolean(isPrivate, 'isPrivate')],
    externalId: [isString(externalId, 'externalId'), maxLength(externalId, 200, 'externalId')],
  });
}

// Un prénom OU un nom suffit (l'import GEDCOM accepte déjà des noms
// incomplets) : seule l'absence totale des deux est rejetée, pour éviter
// une fiche entièrement anonyme créée par erreur. Une fiche affichera un
// libellé « Inconnu »/« Unknown » côté interface si les deux sont vides.
function assertAtLeastOneName(givenNames, familyName) {
  const hasGivenNames = typeof givenNames === 'string' && givenNames.trim() !== '';
  const hasFamilyName = typeof familyName === 'string' && familyName.trim() !== '';
  if (!hasGivenNames && !hasFamilyName) {
    const message = 'givenNames ou familyName doit être renseigné';
    throw new ValidationError('Validation échouée', {
      fields: {
        givenNames: {
          code: 'NAME_REQUIRED',
          translationKey: 'server.validation.nameRequired',
          message,
          variables: { field: 'givenNames' },
        },
        familyName: {
          code: 'NAME_REQUIRED',
          translationKey: 'server.validation.nameRequired',
          message,
          variables: { field: 'familyName' },
        },
      },
      code: 'VALIDATION_FAILED',
      translationKey: 'server.validation.failed',
    });
  }
}

export function validatePersonCreate(payload) {
  assertPayload(payload);
  const { givenNames, familyName, ...rest } = payload;

  assertValid({
    givenNames: [isString(givenNames, 'givenNames'), maxLength(givenNames, 200, 'givenNames')],
    familyName: [isString(familyName, 'familyName'), maxLength(familyName, 200, 'familyName')],
  });
  assertAtLeastOneName(givenNames, familyName);
  validatePersonIdentityFields(payload);

  return {
    givenNames: givenNames ?? '',
    familyName: familyName ?? '',
    birthFamilyName: rest.birthFamilyName ?? null,
    sex: rest.sex ?? 'U',
    notes: rest.notes ?? null,
    nickname: rest.nickname ?? null,
    alias: rest.alias ?? null,
    marriedName: rest.marriedName ?? null,
    title: rest.title ?? null,
    suffix: rest.suffix ?? null,
    isLiving: rest.isLiving ?? true,
    isPrivate: rest.isPrivate ?? false,
    externalId: rest.externalId ?? null,
  };
}

export function validatePersonUpdate(payload) {
  assertPayload(payload);
  const { givenNames, familyName } = payload;

  assertValid({
    givenNames: [isString(givenNames, 'givenNames'), maxLength(givenNames, 200, 'givenNames')],
    familyName: [isString(familyName, 'familyName'), maxLength(familyName, 200, 'familyName')],
  });
  validatePersonIdentityFields(payload);

  const patch = {};
  for (const [key, value] of Object.entries(payload)) {
    if (PERSON_IDENTITY_FIELDS.includes(key)) {
      patch[key] = value;
    }
  }
  if (Object.keys(patch).length === 0) {
    throw new ValidationError('Aucun champ modifiable fourni', {
      code: 'NO_UPDATABLE_FIELD',
      translationKey: 'server.validation.noUpdatableField',
    });
  }
  // Une mise à jour qui toucherait givenNames/familyName ne doit pas pouvoir
  // vider les deux à la fois (même règle qu'à la création).
  if ('givenNames' in patch || 'familyName' in patch) {
    const nextGivenNames = 'givenNames' in patch ? patch.givenNames : undefined;
    const nextFamilyName = 'familyName' in patch ? patch.familyName : undefined;
    // Si un seul des deux champs est modifié, on ne connaît pas ici la valeur
    // actuelle de l'autre : le contrôle strict (les deux vides) est fait par
    // le repository/service qui a accès à l'état existant.
    if (nextGivenNames !== undefined && nextFamilyName !== undefined) {
      assertAtLeastOneName(nextGivenNames, nextFamilyName);
    }
  }
  return patch;
}

export function validatePersonIdentifier(payload) {
  assertPayload(payload);
  const { scheme, value } = payload;
  assertValid({
    scheme: [
      required(scheme, 'scheme'),
      isString(scheme, 'scheme'),
      maxLength(scheme, 40, 'scheme'),
    ],
    value: [required(value, 'value'), isString(value, 'value'), maxLength(value, 200, 'value')],
  });
  const normalizedScheme = scheme.trim().toUpperCase();
  if (!/^[A-Z0-9_]+$/.test(normalizedScheme)) {
    throw fieldError(
      'scheme',
      'INVALID',
      'server.validation.invalid',
      'scheme ne peut contenir que des lettres, chiffres et _',
    );
  }
  if (value.trim() === '') {
    throw fieldError('value', 'REQUIRED', 'server.validation.required', 'value est obligatoire');
  }
  return { scheme: normalizedScheme, value: value.trim() };
}

export function validatePlaceCreate(payload) {
  assertPayload(payload);
  const { name, latitude, longitude } = payload;

  assertValid({
    name: [required(name, 'name'), isString(name, 'name'), maxLength(name, 300, 'name')],
    latitude: [isFiniteNumber(latitude, 'latitude')],
    longitude: [isFiniteNumber(longitude, 'longitude')],
  });

  return { name, latitude: latitude ?? null, longitude: longitude ?? null };
}

export function validateEventCreate(payload) {
  assertPayload(payload);
  const { type, value, dateText, datePrecision, placeId, notes, participants } = payload;

  assertValid({
    type: [required(type, 'type'), oneOf(type, EVENT_TYPES, 'type')],
    value: [isString(value, 'value'), maxLength(value, 500, 'value')],
    dateText: [isString(dateText, 'dateText'), maxLength(dateText, 100, 'dateText')],
    datePrecision: [oneOf(datePrecision, DATE_PRECISIONS, 'datePrecision')],
    placeId: [isInteger(placeId, 'placeId')],
    notes: [isString(notes, 'notes'), maxLength(notes, 5000, 'notes')],
    participants: [isArray(participants, 'participants')],
  });

  const normalizedParticipants = (participants ?? []).map((participant, index) =>
    validateEventParticipant(participant, index),
  );

  return {
    type,
    value: value?.trim() || null,
    dateText: dateText ?? null,
    datePrecision: datePrecision ?? 'UNKNOWN',
    placeId: placeId ?? null,
    notes: notes ?? null,
    participants: normalizedParticipants,
  };
}

function validateEventParticipant(participant, index) {
  if (!isPlainObject(participant)) {
    throw new ValidationError(`participants[${index}] doit être un objet`, {
      code: 'NOT_AN_OBJECT',
      translationKey: 'server.validation.notAnObject',
      variables: { field: `participants[${index}]` },
    });
  }
  const { personId, role } = participant;
  assertValid({
    [`participants[${index}].personId`]: [
      required(personId, 'personId'),
      isInteger(personId, 'personId'),
    ],
    [`participants[${index}].role`]: [
      required(role, 'role'),
      oneOf(role, PARTICIPANT_ROLES, 'role'),
    ],
  });
  return { personId, role };
}

export function validateParticipantAdd(payload) {
  assertPayload(payload);
  return validateEventParticipant(payload, 0);
}

export function validateUnionCreate(payload) {
  assertPayload(payload);
  const { type, startEventId, endEventId, notes, partnerIds } = payload;

  assertValid({
    type: [oneOf(type, UNION_TYPES, 'type')],
    startEventId: [isInteger(startEventId, 'startEventId')],
    endEventId: [isInteger(endEventId, 'endEventId')],
    notes: [isString(notes, 'notes'), maxLength(notes, 5000, 'notes')],
    partnerIds: [required(partnerIds, 'partnerIds'), isArray(partnerIds, 'partnerIds')],
  });

  if (!Array.isArray(partnerIds) || partnerIds.length < 2) {
    throw fieldError(
      'partnerIds',
      'TOO_FEW',
      'server.validation.tooFewPartners',
      'Une union nécessite au moins deux partenaires',
      { field: 'partnerIds', min: 2 },
    );
  }
  partnerIds.forEach((id, index) => assertId(id, `partnerIds[${index}]`));

  return {
    type: type ?? 'OTHER',
    startEventId: startEventId ?? null,
    endEventId: endEventId ?? null,
    notes: notes ?? null,
    partnerIds,
  };
}

export function validateParentageCreate(payload) {
  assertPayload(payload);
  const { childId, parentId, parentRole, linkType, unionId, notes } = payload;

  assertValid({
    childId: [required(childId, 'childId'), isInteger(childId, 'childId')],
    parentId: [required(parentId, 'parentId'), isInteger(parentId, 'parentId')],
    parentRole: [oneOf(parentRole, PARENT_ROLES, 'parentRole')],
    linkType: [oneOf(linkType, LINK_TYPES, 'linkType')],
    unionId: [isInteger(unionId, 'unionId')],
    notes: [isString(notes, 'notes'), maxLength(notes, 5000, 'notes')],
  });

  if (childId === parentId) {
    throw fieldError(
      'parentId',
      'SAME_AS_CHILD',
      'server.validation.sameAsChild',
      'Une personne ne peut pas être son propre parent',
      { field: 'parentId' },
    );
  }

  return {
    childId,
    parentId,
    parentRole: parentRole ?? 'PARENT',
    linkType: linkType ?? 'BIOLOGICAL',
    unionId: unionId ?? null,
    notes: notes ?? null,
  };
}

export function validateSourceCreate(payload) {
  assertPayload(payload);
  const { title, author, publicationInfo } = payload;

  assertValid({
    title: [required(title, 'title'), isString(title, 'title'), maxLength(title, 300, 'title')],
    author: [isString(author, 'author'), maxLength(author, 300, 'author')],
    publicationInfo: [
      isString(publicationInfo, 'publicationInfo'),
      maxLength(publicationInfo, 500, 'publicationInfo'),
    ],
  });

  return { title, author: author ?? null, publicationInfo: publicationInfo ?? null };
}

export function validateCitationCreate(payload) {
  assertPayload(payload);
  const { sourceId, entityType, entityId, page, confidence, notes } = payload;

  assertValid({
    sourceId: [required(sourceId, 'sourceId'), isInteger(sourceId, 'sourceId')],
    entityType: [required(entityType, 'entityType'), oneOf(entityType, ENTITY_TYPES, 'entityType')],
    entityId: [required(entityId, 'entityId'), isInteger(entityId, 'entityId')],
    page: [isString(page, 'page'), maxLength(page, 100, 'page')],
    confidence: [oneOf(confidence, CONFIDENCE_LEVELS, 'confidence')],
    notes: [isString(notes, 'notes'), maxLength(notes, 5000, 'notes')],
  });

  return {
    sourceId,
    entityType,
    entityId,
    page: page ?? null,
    confidence: confidence ?? 'MEDIUM',
    notes: notes ?? null,
  };
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export function validateMediaUpload(payload) {
  assertPayload(payload);
  const { filename, contentBase64, sourceId, entityType, entityId, notes } = payload;

  assertValid({
    filename: [
      required(filename, 'filename'),
      isString(filename, 'filename'),
      maxLength(filename, 255, 'filename'),
    ],
    contentBase64: [
      required(contentBase64, 'contentBase64'),
      isString(contentBase64, 'contentBase64'),
    ],
    sourceId: [isInteger(sourceId, 'sourceId')],
    entityType: [oneOf(entityType, MEDIA_ENTITY_TYPES, 'entityType')],
    entityId: [isInteger(entityId, 'entityId')],
    notes: [isString(notes, 'notes'), maxLength(notes, 5000, 'notes')],
  });

  if (typeof contentBase64 !== 'string' || !BASE64_PATTERN.test(contentBase64.trim())) {
    throw fieldError(
      'contentBase64',
      'INVALID_BASE64',
      'server.validation.invalidBase64',
      'doit être encodé en base64 valide',
      { field: 'contentBase64' },
    );
  }

  if (
    (entityType === undefined || entityType === null) !==
    (entityId === undefined || entityId === null)
  ) {
    throw fieldError(
      'entityType',
      'INCOMPLETE_PAIR',
      'server.validation.incompletePair',
      'entityType et entityId doivent être fournis ensemble',
      { field: 'entityType' },
    );
  }

  return {
    filename,
    contentBase64: contentBase64.trim(),
    sourceId: sourceId ?? null,
    entityType: entityType ?? null,
    entityId: entityId ?? null,
    notes: notes ?? null,
  };
}

export function validateSearchQuery(payload) {
  const { q, entityTypes, limit } = payload;

  assertValid({
    q: [required(q, 'q'), isString(q, 'q'), maxLength(q, 200, 'q')],
    limit: [isInteger(limit, 'limit')],
  });

  let normalizedTypes = null;
  if (entityTypes !== undefined && entityTypes !== null && entityTypes !== '') {
    normalizedTypes = Array.isArray(entityTypes) ? entityTypes : String(entityTypes).split(',');
    normalizedTypes = normalizedTypes.map((type) => String(type).trim().toUpperCase());
    const invalid = normalizedTypes.find((type) => !SEARCH_ENTITY_TYPES.includes(type));
    if (invalid) {
      throw fieldError(
        'entityTypes',
        'INVALID_VALUE',
        'server.validation.invalidValue',
        `valeur invalide : ${invalid}`,
        { field: 'entityTypes', value: invalid },
      );
    }
  }

  const normalizedLimit = limit ? Math.min(Math.max(Number(limit), 1), 100) : 25;

  return { q: q.trim(), entityTypes: normalizedTypes, limit: normalizedLimit };
}

export function validateAccountCreate(payload) {
  assertPayload(payload);
  const { name, pin } = payload;

  assertValid({
    name: [required(name, 'name'), isString(name, 'name'), maxLength(name, 100, 'name')],
    pin: [
      isString(pin, 'pin'),
      () =>
        pin !== undefined && pin !== null && pin.length < 4
          ? 'pin doit contenir au moins 4 caractères'
          : null,
    ],
  });

  return { name: name.trim(), pin: pin ?? null };
}

export function validateAccountLogin(payload) {
  assertPayload(payload);
  const { name, pin } = payload;

  assertValid({
    name: [required(name, 'name'), isString(name, 'name')],
    pin: [isString(pin, 'pin')],
  });

  return { name: name.trim(), pin: pin ?? null };
}

export function validateBackupCreate(payload) {
  const body = payload ?? {};
  if (!isPlainObject(body)) {
    throw new ValidationError('Le corps de la requête doit être un objet JSON', {
      code: 'INVALID_BODY',
      translationKey: 'server.validation.invalidBody',
    });
  }
  const { kind = 'sqlite', label = null } = body;

  assertValid({
    kind: [required(kind, 'kind'), oneOf(kind, ['sqlite', 'json'], 'kind')],
    label: [isString(label, 'label'), maxLength(label, 200, 'label')],
  });

  return { kind, label };
}

function assertPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new ValidationError('Le corps de la requête doit être un objet JSON', {
      code: 'INVALID_BODY',
      translationKey: 'server.validation.invalidBody',
    });
  }
}
