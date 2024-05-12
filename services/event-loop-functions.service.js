import { BookingStatus } from "../constants/common.constant.js";
import { CommunityCenter } from "../models/community.model.js";

const modifyBookingStatus = async (communityCenterId, bookingIds) => {
  try {
    // Find the community center
    const communityCenter = await CommunityCenter.findById(communityCenterId);

    // Iterate through communityTimeSlots
    for (const timeSlot of communityCenter.communityTimeSlots) {
      // Iterate through slots within timeSlot
      for (const slot of timeSlot.slots) {
        // Find and update bookings with matching bookingIds
        for (const bookingId of bookingIds) {
          const bookingIndex = slot.bookings.findIndex(
            (booking) => booking._id.toString() === bookingId
          );
          if (bookingIndex !== -1) {
            slot.bookings[bookingIndex].status = BookingStatus.ASSIGNED;
          }
        }
      }
    }

    // Save the modified community center
    await communityCenter.save();
  } catch (error) {
    // Handle error
    console.error("Error modifying booking status:", error);
    throw error; // Propagate the error for handling at the caller level
  }
};

export { modifyBookingStatus };
