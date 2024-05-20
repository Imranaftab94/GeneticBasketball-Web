import express from "express";
import {
  admin,
  adminAndCommunity,
  protect,
} from "../middleware/auth.middleware.js";
import {
  addOrUpdatePlayerMatchStat,
  changeMatchStatus,
  createMatch,
  getAllMatchesWithinAdmin,
  getMatchesBasedonCommunity,
  getMatchesBasedonUser,
  getPlayerOverallStats,
} from "../controllers/match.controller.js";

const router = express.Router();

router.route("/createMatch").post(protect, adminAndCommunity, createMatch);
router.route("/getList").get(protect, getMatchesBasedonUser);
router
  .route("/communityMatches")
  .get(protect, adminAndCommunity, getMatchesBasedonCommunity);
router
  .route("/updateStatus")
  .put(protect, adminAndCommunity, changeMatchStatus);
router.route("/admin/getList").get(protect, admin, getAllMatchesWithinAdmin);
router
  .route("/addOrUpdatePlayerStats")
  .post(protect, adminAndCommunity, addOrUpdatePlayerMatchStat);

  router.route("/playerOverAllStats").get(protect, getPlayerOverallStats);

export default router;
