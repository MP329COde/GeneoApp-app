import { Router } from 'express';
import { createAuditController } from '../controllers/audit.controller.js';
import { requireProtectedSession } from '../middleware/require-session.js';

export function auditRoutes(services) {
  const controller = createAuditController(services);
  const router = Router();

  router.get('/:tableName/:rowId', controller.listForEntity);
  // Purge du journal : action destructive, elle exige une session protégée
  // comme les autres suppressions de l'application.
  router.delete('/older-than', requireProtectedSession(services), controller.purge);

  return router;
}
