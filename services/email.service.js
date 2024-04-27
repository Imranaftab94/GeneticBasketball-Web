import nodemailer from "nodemailer";
import dotenv from "dotenv";

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
};

/**
 * Genereate communiy center credential email content
 * @param {string} name
 * @param {string} email
 * * @param {string} password
 * @returns
 */
export const generateCommunityCenterCredentialEmailContent = (name, email, password) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Our Platform</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
          margin: 0;
          padding: 0;
        }
    
        .container {
          max-width: 600px;
          margin: 20px auto;
          padding: 20px;
          background-color: #fff;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
    
        .header {
          background-color: #C41A16;
          color: #fff;
          padding: 10px;
          text-align: center;
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
        }
    
        .content {
          padding: 20px;
        }
    
        .button {
          display: inline-block;
          background-color: #007bff;
          color: #fff;
          text-decoration: none;
          padding: 10px 20px;
          border-radius: 5px;
          margin-top: 20px;
        }
    
        .button:hover {
          background-color: #0056b3;
        }
    
        .footer {
          margin-top: 20px;
          text-align: center;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>Welcome to Our Platform</h2>
        </div>
        <div class="content">
          <p>Hello <strong>${name}</strong>,</p>
          <p>Welcome to our platform! Below are your login credentials:</p>
          <ul>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Password:</strong> ${password}</li>
          </ul>
          <p>Please keep your credentials secure and do not share them with anyone.</p>
          <p style="color: #C41A16;"><strong>Please change your password once you have logged in.</strong></p>
        </div>
        <div class="footer">
      <p>Regards <br/> The Team, Genetic Basketball</p>
    </div>
      </div>
    </body>
    </html>
  `;
};
