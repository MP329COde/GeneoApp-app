import { Router } from 'express';
import { createResearchController } from '../controllers/research.controller.js';

export function researchRoutes(services) {
  const controller = createResearchController(services);
  const router = Router();
  router.post('/', controller.create);
  router.get('/', controller.list);
  router.patch('/hypotheses/:id', controller.updateHypothesis);
  router.delete('/hypotheses/:id', controller.removeHypothesis);
  router.post('/hypotheses/:id/evidence', controller.addEvidence);
  router.delete('/evidence/:id', controller.removeEvidence);
  router.patch('/tasks/:id', controller.updateTask);
  router.delete('/tasks/:id', controller.removeTask);
  router.get('/:id', controller.get);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  router.post('/:id/hypotheses', controller.addHypothesis);
  router.post('/:id/tasks', controller.addTask);
  return router;
}
