const express = require("express");
const router = express.Router();
const {getAllPapers, searchPapers, savePaperEmbedding, semanticSearch} = require("../controllers/PaperController")
const { protect, authorize } = require("../middleware/auth");

// All routes below require authentication + admin role
router.use(protect);
router.post("/papers",getAllPapers);
router.get('/papers',searchPapers);
router.post('/papers/embeddings',savePaperEmbedding);
router.get('/papers/semanticSearch', semanticSearch);

module.exports = router;