import {
  assertValid,
  required,
  isString,
  nonEmptyString,
  maxLength,
  oneOf,
  isInteger,
  isFiniteNumber,
  isArray,
  isPlainObject,
} from './validators.js';
import { ValidationError } from '../errors.js';

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
  'CENSUS',
  'MILITARY',
  'GRADUATION',
  'WILL',
  'PROBATE',
  'RELIGIOUS_EVENT',
  'NATURALIZATION',
  'OTHER',
];
const DATE_PRECISIONS = ['EXACT', 'ABOUT', 'BEFORE', 'AFTER', 'BETWEEN', 'UNKNOWN'];
const PARTICIPANT_ROLES = ['PRINCIPAL', 'PARTNER1', 'PARTNER2', 'WITNESS', 'OFFICIANT'];
const UNION_TYPES = ['MARRIAGE', 'CIVIL_PARTNERSHIP', 'COHABITATION', 'OTHER'];
const PARENT_ROLES = ['FATHER', 'MOTHER', 'PARENT'];
const LINK_TYPES = ['BIOLOGICAL', 'ADOPTIVE', 'FOSTER', 'STEP', 'UNKNOWN'];
const ENTITY_TYPES = ['PERSON', 'EVENT', 'UNION', 'PARENTAGE'];
const CONFIDENCE_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];
const MEDIA_ENTITY_TYPES = ['PERSON', 'EVENT', 'UNION', 'PARENTAGE', 'SOURCE'];
const SEARCH_ENTITY_TYPES = ['PERSON', 'PLACE', 'EVENT', 'SOURCE', 'MEDIA'];

export function assertId(value, label = 'id') {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${label} doit être un identifiant entier positif`);
  }
}

export function validatePersonCreate(payload) {
  assertPayload(payload);
  const { givenNames, familyName, birthFamilyName, sex, notes } = payload;

  assertValid({
    givenNames: [
      required(givenNames, 'givenNames'),
      isString(givenNames, 'givenNames'),
      maxLength(givenNames, 200, 'givenNames'),
    ],
    familyName: [
      required(familyName, 'familyName'),
      isString(familyName, 'familyName'),
      maxLength(familyName, 200, 'familyName'),
    ],
    birthFamilyName: [
      isString(birthFamilyName, 'birthFamilyName'),
      maxLength(birthFamilyName, 200, 'birthFamilyName'),
    ],
    sex: [oneOf(sex, SEX_VALUES, 'sex')],
    notes: [isString(notes, 'notes'), maxLength(notes, 5000, 'notes')],
  });

  return {
    givenNames,
    familyName,
    birthFamilyName: birthFamilyName ?? null,
    sex: sex ?? 'U',
    notes: notes ?? null,
  };
}

export function validatePersonUpdate(payload) {
  assertPayload(payload);
  const { givenNames, familyName, birthFamilyName, sex, notes } = payload;

  assertValid({
    givenNames: [
      nonEmptyString(givenNames, 'givenNames'),
      maxLength(givenNames, 200, 'givenNames'),
    ],
    familyName: [
      nonEmptyString(familyName, 'familyName'),
      maxLength(familyName, 200, 'familyName'),
    ],
    birthFamilyName: [
      isString(birthFamilyName, 'birthFamilyName'),
      maxLength(birthFamilyName, 200, 'birthFamilyName'),
    ],
    sex: [oneOf(sex, SEX_VALUES, 'sex')],
    notes: [isString(notes, 'notes'), maxLength(notes, 5000, 'notes')],
  });

  const patch = {};
  for (const [key, value] of Object.entries(payload)) {
    if (['givenNames', 'familyName', 'birthFamilyName', 'sex', 'notes'].includes(key)) {
      patch[key] = value;
    }
  }
  if (Object.keys(patch).length === 0) {
    throw new ValidationError('Aucun champ modifiable fourni');
  }
  return patch;
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
  const { type, dateText, datePrecision, placeId, notes, participants } = payload;

  assertValid({
    type: [required(type, 'type'), oneOf(type, EVENT_TYPES, 'type')],
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
    dateText: dateText ?? null,
    datePrecision: datePrecision ?? 'UNKNOWN',
    placeId: placeId ?? null,
    notes: notes ?? null,
    participants: normalizedParticipants,
  };
}

function validateEventParticipant(participant, index) {
  if (!isPlainObject(participant)) {
    throw new ValidationError(`participants[${index}] doit être un objet`);
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
    throw new ValidationError('Une union nécessite au moins deux partenaires', {
      fields: { partnerIds: 'doit contenir au moins deux identifiants' },
    });
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
    throw new ValidationError('Une personne ne peut pas être son propre parent', {
      fields: { parentId: 'doit être différent de childId' },
    });
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
    throw new ValidationError('Validation échouée', {
      fields: { contentBase64: 'doit être encodé en base64 valide' },
    });
  }

  if (
    (entityType === undefined || entityType === null) !==
    (entityId === undefined || entityId === null)
  ) {
    throw new ValidationError('Validation échouée', {
      fields: { entityType: 'entityType et entityId doivent être fournis ensemble' },
    });
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
      throw new ValidationError('Validation échouée', {
        fields: { entityTypes: `valeur invalide : ${invalid}` },
      });
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
    throw new ValidationError('Le corps de la requête doit être un objet JSON');
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
    throw new ValidationError('Le corps de la requête doit être un objet JSON');
  }
}
