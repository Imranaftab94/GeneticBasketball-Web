import express from "express";
import {
  authUser,
  registerUser,
  updateUserProfile,
} from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
const router = express.Router();

router.post("/register", registerUser);
router.post("/login", authUser);
router.route("/updateProfile").put(protect, updateUserProfile);

export default router;
