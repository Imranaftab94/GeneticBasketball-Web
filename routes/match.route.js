import express from "express";
import {
	admin,
	adminAndCommunity,
	protect,
} from "../middleware/auth.middleware.js";
import {
	addOrUpdatePlayerMatchStat,
	changeMatchStatus,
	communityCenterListingBasedOnUser,
	createMatch,
	getAllMatchesWithinAdmin,
	getMatchDetailsWithStats,
	getMatchesBasedonBookingId,
	getMatchesBasedonCommunity,
	getMatchesBasedonUser,
	getPlayerOverallStats,
	scoreBoard,
	scoreBoardAdminSide,
	uploadHighlights,
} from "../controllers/match.controller.js";
import multer from "multer";
const upload = multer().single("videoFrame");

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
router.route("/getListBasedOnbooking").get(protect, getMatchesBasedonBookingId);
router
	.route("/uploadHighlights")
	.post(protect, admin, upload, uploadHighlights);
router.route("/scoreBoard").get(protect, scoreBoard);
router.route("/admin/scoreBoard").get(protect, admin, scoreBoardAdminSide);
router.route("/matchDetail").get(protect, getMatchDetailsWithStats);
router
	.route("/communityCentersList")
	.get(protect, communityCenterListingBasedOnUser);

export default router;
