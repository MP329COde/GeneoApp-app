import { Router } from 'express';
import { createAuditController } from '../controllers/audit.controller.js';

export function auditRoutes(services) {
  const controller = createAuditController(services);
  const router = Router();

  router.get('/:tableName/:rowId', controller.listForEntity);

  return router;
}
