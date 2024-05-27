import express from "express";
import { adminAndCommunity, protect } from "../middleware/auth.middleware.js";
import { createTournament } from "../controllers/tournament.controller.js";

const router = express.Router();

router
  .route("/createTournament")
  .post(protect, adminAndCommunity, createTournament);

export default router;
