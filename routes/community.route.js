import express from "express";
import { admin, protect } from "../middleware/auth.middleware.js";
import { addSlots, getCommunities, getCommunityDetail, registerCommunity } from "../controllers/community.controller.js";
const router = express.Router();

router.route("/getAll").get(protect, getCommunities);
router.route("/register").post(protect, admin, registerCommunity);
router.route("/addSlots").post(protect, admin, addSlots);
router.route("/:id").get(protect, admin, getCommunityDetail)

export default router;
