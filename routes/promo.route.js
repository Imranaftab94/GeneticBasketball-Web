import express from "express";
import { admin, protect } from "../middleware/auth.middleware.js";
import { addPromoCode, verifyPromoCode } from "../controllers/promo.controller.js";

const router = express.Router();

router.route("/createPromo").post(protect, admin, addPromoCode);
router.route("/verifyPromo").post(protect, verifyPromoCode);

export default router;
