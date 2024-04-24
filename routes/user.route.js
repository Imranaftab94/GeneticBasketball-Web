import express from "express";
import {
  authUser,
  getUserProfile,
  registerUser,
  resetPassword,
  sendOTP,
  socialAuth,
  updateUserProfile,
  verifyAccountEmail,
  verifyOTPCode,
} from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
const router = express.Router();

router.post("/register", registerUser);
router.post("/login", authUser);
router.route("/updateProfile").put(protect, updateUserProfile);
router.post("/socialAuth", socialAuth);
router.route("/profile").get(protect, getUserProfile);
router.post("/sendOTP", sendOTP);
router.post("/verifyOTP", verifyOTPCode);
router.post("/resetPassword", resetPassword);
router.post("/verifyAccountEmail", verifyAccountEmail)

export default router;
