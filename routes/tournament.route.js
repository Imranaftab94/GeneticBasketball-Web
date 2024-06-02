import express from "express";
import { adminAndCommunity, protect } from "../middleware/auth.middleware.js";
import {
  addTournamentBooking,
  createTournament,
  listTournaments,
} from "../controllers/tournament.controller.js";

const router = express.Router();

router
  .route("/createTournament")
  .post(protect, adminAndCommunity, createTournament);
router.route("/getListing").get(protect, listTournaments);
router
  .route("/addTournamentBooking")
  .post(protect, addTournamentBooking);

export default router;
