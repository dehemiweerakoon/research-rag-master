const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {saveResearchPapers, QueryResearch} = require('../controllers/paperSuggestions');
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage()
});

router.use(protect);
router.post('/suggestions/upload',upload.single('file'),saveResearchPapers);
router.post('/suggestions/query', QueryResearch);

module.exports = router;