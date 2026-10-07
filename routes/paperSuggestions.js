const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {saveResearchPapers} = require('../controllers/paperSuggestions');
const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage()
});

router.use(protect);
router.post('/suggestions/upload',upload.single('file'),saveResearchPapers);

module.exports = router;