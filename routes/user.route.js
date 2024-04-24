import express from "express";
import {
  authUser,
  registerUser,
  socialAuth,
  updateUserProfile,
} from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
const router = express.Router();

router.post("/register", registerUser);
router.post("/login", authUser);
router.route("/updateProfile").put(protect, updateUserProfile);
router.post("/socialAuth", socialAuth);

export default router;
