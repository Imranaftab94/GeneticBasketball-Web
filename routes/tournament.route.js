import express from "express";
import { adminAndCommunity, protect } from "../middleware/auth.middleware.js";
import {
  addOrUpdateTournamentPlayerMatchStat,
  addTournamentBooking,
  changeTournamentMatchStatus,
  createMatchWithTeams,
  createTournament,
  getBookingsByTournament,
  getMatchesByTournament,
  getPlayerRankingsWithinTournament,
  getTournamentStats,
  listTournaments,
  listTournamentsUnderCommunity,
  updateTournamentAndBookings,
} from "../controllers/tournament.controller.js";

const router = express.Router();

router
  .route("/createTournament")
  .post(protect, adminAndCommunity, createTournament);
router.route("/getListing").get(protect, listTournaments);
router.route("/addTournamentBooking").post(protect, addTournamentBooking);
router
  .route("/startTournament")
  .post(protect, adminAndCommunity, updateTournamentAndBookings);
  router
  .route("/createTournamentMatch")
  .post(protect, adminAndCommunity, createMatchWithTeams);
  router.route("/matches").get(protect, getMatchesByTournament);
  router.route("/communityTournaments").get(protect, listTournamentsUnderCommunity);
  router.route("/booking").get(protect, getBookingsByTournament);
  router.route("/matches/addOrUpdatePlayerMatchStats").post(protect, adminAndCommunity, addOrUpdateTournamentPlayerMatchStat);
  router.route("/matches/updateStatus").post(protect, adminAndCommunity, changeTournamentMatchStatus);
  router.route("/rankings").get(protect, getPlayerRankingsWithinTournament);
  router.route("/overAllStats").get(protect, getTournamentStats);

export default router;
