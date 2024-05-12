import { BookingStatus } from "../constants/common.constant.js";
import { Roles } from "../constants/role.constant.js";
import { CommunityCenter } from "../models/community.model.js";
import { User } from "../models/user.model.js";
import { sendMail } from "./email.service.js";

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

async function sendMatchStartPaymentInfo(
  communityCenterId,
  startTime,
  endTime,
  match_date
) {
  try {
    // Find community center
    const community = await CommunityCenter.findById(communityCenterId);

    if (!community) {
      throw new Error("Community center not found");
    }

    // Find admin users
    const admins = await User.find({ role: Roles.ADMIN }); // Adjust this query according to your user model

    if (!admins || admins.length === 0) {
      throw new Error("No admin users found");
    }

    // Prepare HTML email content
    const emailContent = `
    <!DOCTYPE html>
    <html lang="en">
    
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Match Started - Payment Pending</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
            }
    
            .container {
                max-width: 600px;
                margin: 20px auto;
                border: 1px solid #ccc;
                border-radius: 5px;
                overflow: hidden;
            }
    
            .header {
                background-color: #007bff;
                color: #fff;
                padding: 20px;
                border-radius: 5px 5px 0 0;
            }
    
            .content {
                padding: 20px;
            }
    
            .content p {
                margin-bottom: 15px;
            }
    
            .content ul {
                list-style: none;
                padding: 0;
            }
    
            .content ul li {
                margin-bottom: 10px;
            }
    
            .content ul li strong {
                font-weight: bold;
            }
    
            .footer {
                background-color: #f9f9f9;
                padding: 10px;
                text-align: center;
                border-top: 1px solid #ccc;
                border-radius: 0 0 5px 5px;
            }
        </style>
    </head>
    
    <body>
        <div class="container">
            <div class="header">
                <h2>Match Started - Payment Pending</h2>
            </div>
            <div class="content">
                <p>Hello,</p>
                <p>This is a notification that a match has started at your community center (<b>${community.name}</b>).</p>
                <p>Please note that payment of <strong>$${community.price}</strong> for the match is pending. Below are the details:</p>
                <ul>
                    <li><strong>Start Time:</strong> ${startTime}</li>
                    <li><strong>End Time:</strong> ${endTime}</li>
                </ul>
                <p>Thank you.</p>
            </div>
            <div class="footer">
                <p>© ${new Date().getFullYear()} Genetic Basketball. All rights reserved.</p>
            </div>
        </div>
    </body>
    
    </html>
    
    `;

    // Send email to community center
    await sendMail(
      community.email,
      "Match Started - Payment Pending",
      emailContent
    );

    // Send email to each admin
    for (const admin of admins) {
      await sendMail(
        admin.email,
        "Match Started - Payment Pending",
        emailContent
      );
    }

    console.log("Match start notifications sent successfully");
  } catch (error) {
    console.error("Error sending match start notification:", error);
    throw error;
  }
}

export { modifyBookingStatus, sendMatchStartPaymentInfo };
