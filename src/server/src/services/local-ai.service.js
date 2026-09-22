import { ServiceUnavailableError } from '../errors.js';

export class LocalAiService {
  constructor({ enabled = process.env.GENEOAPP_LOCAL_AI === 'true' } = {}) {
    this.enabled = enabled;
  }

  analyze() {
    if (!this.enabled) throw new ServiceUnavailableError('L’IA locale est désactivée');
    throw new ServiceUnavailableError('Aucun fournisseur IA locale configuré');
  }
}
