import express from "express";
import { admin, protect } from "../middleware/auth.middleware.js";
import { getCommunities, registerCommunity } from "../controllers/community.controller.js";
const router = express.Router();

router.route("/getAll").get(protect, getCommunities);
router.route("/register").post(protect, admin, registerCommunity)

export default router;
