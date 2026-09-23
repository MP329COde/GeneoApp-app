import { NotFoundError, ValidationError } from '../errors.js';
import { validateTimeline } from './timeline-validation.js';

const CONFIDENCE_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };

/**
 * Qualité des données d'une personne : faits sourcés, faits sans source,
 * niveau de confiance des citations et contradictions ouvertes. Une
 * information non sourcée est montrée comme telle, jamais masquée.
 */
export class QualityService {
  constructor(database) {
    this.database = database;
  }

  forPerson(personId) {
    const id = Number(personId);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Identifiant invalide');
    const person = this.database
      .prepare('SELECT id FROM persons WHERE id = ? AND deleted_at IS NULL')
      .get(id);
    if (!person) throw new NotFoundError('Personne introuvable');

    const events = this.database
      .prepare(
        `SELECT DISTINCT e.id, e.type, e.date_text
         FROM events e JOIN event_participants ep ON ep.event_id = e.id AND ep.deleted_at IS NULL
         WHERE ep.person_id = ? AND e.deleted_at IS NULL ORDER BY e.id`,
      )
      .all(id);
    const citationsFor = this.database.prepare(
      `SELECT c.confidence, s.title FROM citations c
       JOIN sources s ON s.id = c.source_id AND s.deleted_at IS NULL
       WHERE c.entity_type = ? AND c.entity_id = ? AND c.deleted_at IS NULL`,
    );
    const identityCitations = citationsFor.all('PERSON', id);
    const facts = [
      { kind: 'IDENTITY', id, label: 'Identité', citations: identityCitations },
      ...events.map((event) => ({
        kind: 'EVENT',
        id: event.id,
        type: event.type,
        dateText: event.date_text,
        citations: citationsFor.all('EVENT', event.id),
      })),
    ].map((fact) => ({
      ...fact,
      sourced: fact.citations.length > 0,
      bestConfidence:
        fact.citations
          .map((citation) => citation.confidence)
          .sort((a, b) => CONFIDENCE_RANK[b] - CONFIDENCE_RANK[a])[0] ?? null,
      citationCount: fact.citations.length,
      citations: undefined,
    }));

    const issues = validateTimeline(this.database).filter(
      (issue) => issue.personId === id || issue.childId === id || issue.parentId === id,
    );
    const sourced = facts.filter((fact) => fact.sourced).length;
    const confidence = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const fact of facts) if (fact.bestConfidence) confidence[fact.bestConfidence] += 1;
    // Score 0 à 4 : part de faits sourcés, pondérée par la confiance, moins les erreurs certaines.
    const weighted =
      facts.reduce((sum, fact) => sum + (CONFIDENCE_RANK[fact.bestConfidence] ?? 0), 0) /
      Math.max(1, facts.length * 3);
    const certain = issues.filter((issue) => issue.severity === 'CERTAIN').length;
    const score = Math.max(0, Math.min(4, Math.round(weighted * 4) - certain));
    return {
      personId: id,
      facts,
      totals: { facts: facts.length, sourced, unsourced: facts.length - sourced },
      confidence,
      issues,
      score,
    };
  }
}
