const express = require("express");
const router = express.Router();
const {getAllPapers, searchPapers, savePaperEmbedding} = require("../controllers/PaperController")
const { protect, authorize } = require("../middleware/auth");

// All routes below require authentication + admin role
router.use(protect);
router.post("/papers",getAllPapers);
router.get('/papers',searchPapers);
router.post('/papers/embeddings',savePaperEmbedding)

module.exports = router;