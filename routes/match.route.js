import express from "express";
import {
  admin,
  adminAndCommunity,
  protect,
} from "../middleware/auth.middleware.js";
import { createMatch, getMatchesBasedonCommunity, getMatchesBasedonUser } from "../controllers/match.controller.js";

const router = express.Router();

router.route("/createMatch").post(protect, adminAndCommunity, createMatch);
router.route("/getList").get(protect, getMatchesBasedonUser);
router.route("/communityMatches").get(protect, adminAndCommunity, getMatchesBasedonCommunity);

export default router;
