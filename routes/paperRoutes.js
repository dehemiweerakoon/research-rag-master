const express = require("express");
const router = express.Router();
const {getAllPapers, searchPapers} = require("../controllers/PaperController")
const { protect, authorize } = require("../middleware/auth");

// All routes below require authentication + admin role
router.use(protect);
router.post("/papers",getAllPapers);
router.get('/papers',searchPapers);

module.exports = router;