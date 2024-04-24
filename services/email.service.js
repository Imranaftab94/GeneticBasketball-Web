import nodemailer from "nodemailer";
import dotenv from 'dotenv';

dotenv.config();

const yourEmail = process.env.YOUR_EMAIL;
const yourPass = process.env.YOUR_PASS;
const mailHost = process.env.MAIL_HOST;
const mailPort = process.env.MAIL_PORT;
const senderEmail = process.env.SENDER_EMAIL;

/**
 * Send mail
 * @param {string} to 
 * @param {string} subject 
 * @param {string[html]} htmlContent 
 * @returns 
 */
export const sendMail = async (to, subject, htmlContent) => {
  let transporter = nodemailer.createTransport({
    host: mailHost,
    port: mailPort,
    secure: false, // use SSL - TLS
    auth: {
      user: yourEmail,
      pass: yourPass,
    },
  });
  let mailOptions = {
    from: senderEmail,
    to: to,
    subject: subject,
    html: htmlContent,
  };
  return transporter.sendMail(mailOptions); // promise
};

/**
 * Genereate otp email content
 * @param {string} email
 * @param {string} content 
 * @returns 
 */
export const generateOTPEmailContent = (otp) => {
    return `
        <html>
        <body>
            <p>Dear User,</p>
            <p>Your One-Time Password (OTP) is:</p>
            <h2 style="background-color: #f0f0f0; padding: 10px; color:#C41A16; border-radius: 5px; text-align:center;">${otp}</h2>
            <p>Please use this OTP to verify your email address.</p>
            <p>If you did not request this OTP, please ignore this email.</p>
            <p>Thank you for using our service.</p>
            <p>Best regards,<br> <b>The Team, Genetic Basketball<b/></p>
        </body>
        </html>
    `;
}
