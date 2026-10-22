import { parsePersonsListQuery } from '../services/person.service.js';

export function createPersonController(services) {
  const { persons } = services;

  return {
    create(request, response) {
      const person = persons.create(request.body, { performedBy: request.performedBy });
      response.status(201).json(person);
    },

    get(request, response) {
      const person = persons.get(Number(request.params.id));
      response.json(person);
    },

    list(request, response) {
      const options = parsePersonsListQuery(request.query);

      // Sans paramètre de pagination : comportement historique (tableau
      // complet), utilisé par l'IPC Electron et les calculs locaux du client.
      if (!options.paginated) {
        response.json(persons.list({ includeDeleted: options.includeDeleted }));
        return;
      }

      // `total=true` : uniquement le nombre de personnes correspondantes.
      if (options.totalOnly) {
        response.json({
          total: persons.count({ includeDeleted: options.includeDeleted, q: options.q }),
        });
        return;
      }

      const { items, total } = persons.list({
        includeDeleted: options.includeDeleted,
        limit: options.limit,
        offset: options.offset,
        q: options.q,
      });
      response.json({
        items,
        total,
        limit: options.limit,
        offset: options.offset,
      });
    },

    update(request, response) {
      const person = persons.update(Number(request.params.id), request.body, {
        performedBy: request.performedBy,
      });
      response.json(person);
    },

    remove(request, response) {
      persons.remove(Number(request.params.id), { performedBy: request.performedBy });
      response.status(204).end();
    },

    restore(request, response) {
      const person = persons.restore(Number(request.params.id), {
        performedBy: request.performedBy,
      });
      response.json(person);
    },
  };
}
