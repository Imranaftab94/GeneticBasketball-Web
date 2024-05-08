import express from "express";
import { admin, adminAndCommunity, protect } from "../middleware/auth.middleware.js";
import {
    addBookingToSlot,
  addSlots,
  deleteSlot,
  getCommunities,
  getCommunityDetail,
  getCommunitySlots,
  getCommunitySlotsBasedonDateRange,
  registerCommunity,
} from "../controllers/community.controller.js";
const router = express.Router();

router.route("/getAll").get(protect, getCommunities);
router.route("/register").post(protect, admin, registerCommunity);
router.route("/addSlots").post(protect, adminAndCommunity, addSlots);
router.route("/:id").get(protect, getCommunityDetail);
router.route("/:communityId/slot/:slotId").delete(protect, admin, deleteSlot);
router.route('/:communityCenterId/bookings/:date').get(protect, getCommunitySlots);
router.route('/slot/addBooking').post(protect, addBookingToSlot);
router.route('/slots/slotsBasedonDate').get(protect, getCommunitySlotsBasedonDateRange);

export default router;
