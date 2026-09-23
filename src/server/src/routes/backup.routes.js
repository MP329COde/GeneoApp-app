import { Router } from 'express';
import { createBackupController } from '../controllers/backup.controller.js';
import { requireSession } from '../middleware/require-session.js';

export function backupRoutes(services) {
  const controller = createBackupController(services);
  const router = Router();

  router.use(requireSession(services));

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.post('/import-encrypted', controller.importEncrypted);
  router.post('/:filename/export-encrypted', controller.exportEncrypted);
  router.get('/:filename/verify', controller.verify);
  router.post('/:filename/restore', controller.restore);

  return router;
}
