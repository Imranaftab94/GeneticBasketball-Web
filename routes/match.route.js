import express from "express";
import {
  admin,
  adminAndCommunity,
  protect,
} from "../middleware/auth.middleware.js";
import { createMatch } from "../controllers/match.controller.js";

const router = express.Router();

router.route("/createMatch").post(protect, adminAndCommunity, createMatch);

export default router;
