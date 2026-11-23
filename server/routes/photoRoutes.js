import { Router } from 'express';
import { createPhoto, deletePhoto, listPhotos } from '../controllers/photoController.js';

const router = Router();

router.get('/', listPhotos);
router.post('/', createPhoto);
router.delete('/:captureId', deletePhoto);

export default router;
