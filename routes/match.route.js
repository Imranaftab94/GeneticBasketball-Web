import express from "express";
import {
  admin,
  adminAndCommunity,
  protect,
} from "../middleware/auth.middleware.js";
import { changeMatchStatus, createMatch, getAllMatchesWithinAdmin, getMatchesBasedonCommunity, getMatchesBasedonUser } from "../controllers/match.controller.js";

const router = express.Router();

router.route("/createMatch").post(protect, adminAndCommunity, createMatch);
router.route("/getList").get(protect, getMatchesBasedonUser);
router.route("/communityMatches").get(protect, adminAndCommunity, getMatchesBasedonCommunity);
router.route("/updateStatus").put(protect, adminAndCommunity, changeMatchStatus);
router.route("/admin/getList").get(protect, admin, getAllMatchesWithinAdmin);


export default router;
