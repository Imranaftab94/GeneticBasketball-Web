import express from "express";
import { adminAndCommunity, protect } from "../middleware/auth.middleware.js";
import {
  addTournamentBooking,
  createTournament,
  listTournaments,
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

export default router;
