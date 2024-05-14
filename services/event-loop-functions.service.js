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

function calculateHoursBetweenOnlyTimes(startTime, endTime) {
    // Parse start and end times into Date objects
    const start = new Date("2000-01-01 " + startTime); // Concatenate with dummy date for parsing
    const end = new Date("2000-01-01 " + endTime);

    // Calculate difference in milliseconds
    const differenceMs = end - start;

    // Convert milliseconds to hours
    const differenceHours = differenceMs / (1000 * 60 * 60);

    return differenceHours;
}


function generateRandomNumberString(length) {
    let result = '';
    const characters = '0123456789'; // Pool of characters to choose from

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(randomIndex);
    }

    return result;
}


async function sendMatchStartPaymentInfo(
  communityCenterId,
  startTime,
  endTime,
  match_date,
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

    let date = new Date(match_date).toLocaleDateString();
    let month = new Date(match_date).toLocaleString('default', { month: 'long' });
    const hoursBetween = calculateHoursBetweenOnlyTimes(startTime, endTime);

    // Check for invalid hours calculation
    if (isNaN(hoursBetween)) throw new Error("Invalid time interval");

    // Prepare HTML email content
    const emailContent = `
    <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Professional Invoice</title>
<style>
    body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        margin: 0;
        padding: 0;
        background-color: #f9f9f9;
        color: #333;
    }
    .container {
        max-width: 800px;
        margin: 40px auto;
        background: #fff;
        padding: 20px;
        box-shadow: 0 0 15px rgba(0,0,0,0.1);
    }
    .header {
        text-align: center;
        border-bottom: 2px solid #007BFF;
        margin-bottom: 20px;
        padding-bottom: 10px;
    }
    .header h1 {
        font-size: 28px;
        color: #007BFF;
    }
    section {
        margin-top: 20px;
        line-height: 1.6;
        font-size: 16px;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
    }
    th, td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #ddd;
    }
    th {
        background-color: #f1f1f1;
        color: #333;
    }
    .total {
        text-align: right;
        font-weight: bold;
        font-size: 16px;
    }
    .btn-print {
        display: block;
        width: 100%;
        padding: 15px;
        text-align: center;
        background-color: #007BFF;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 16px;
        margin-top: 20px;
    }

    /* CSS for printing */
    @media print {
        body {
            background-color: #FFFFFF;
            color: #000000;
        }
        .container {
            max-width: 100%;
            box-shadow: none;
            margin: 0;
            padding: 0;
        }
        .btn-print {
            display: none; /* Hide button when printing */
        }
    }
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>INVOICE</h1>
    </div>
    <section>
        <strong>BILL FROM</strong><br>
        Name: ${community.name}<br>
        Email: ${community.email}<br>
        Address: ${community.address}<br>
    </section>

    <section>
        <strong>BILL TO</strong><br>
        Genetic Basketball,<br>
    </section>

    <table>
        <tr>
            <td>Invoice No:</td>
            <td>${generateRandomNumberString(4)}</td>
        </tr>
        <tr>
            <td>Invoice Month:</td>
            <td>${month}</td>
        </tr>
        <tr>
            <td>Invoice Date:</td>
            <td>${date}</td>
        </tr>
    </table>

    <table>
        <tr>
            <th style="background-color: #f1f1f1;
        color: #333;">ID</th>
            <th>DESCRIPTION</th>
            <th>PAYMENT</th>
        </tr>
        <tr>
            <td>01</td>
            <td>Payment for the ${hoursBetween} hours from ${startTime} to ${endTime}</td>
            <td>${community.price} $</td>
        </tr>
    </table>
    <table>
        <tr>
            <td class="total" colspan="2">Total</td>
            <td>${community.price} $</td>
        </tr>
    </table>
    <button class="btn-print" onclick="window.print()">Print Invoice</button>
</div>
</body>
</html>

    
    `;

    // Send email to community center
    await sendMail(
      community.email,
      "Match Started - Payment Pending Invoice",
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
