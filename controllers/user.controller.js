import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { generateToken } from "../services/generateToken.service.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import {
  registerUserSchema,
  sendOtpSchema,
  socailSignUpUserSchema,
  userSchema,
  verifyOTPSchema,
} from "../validators/user.validator.js";
import {
  extractFirstAndLastName,
  generateOTP,
} from "../services/common.service.js";
import {
  generateOTPEmailContent,
  sendMail,
} from "../services/email.service.js";
import { Roles } from "../constants/role.constant.js";
import { CommunityCenter } from "../models/community.model.js";

// @desc    Register a new user
// @route   POST /api/v1/users/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate request body
  const { error } = registerUserSchema.validate(req.body);
  if (error) {
    errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
    return;
  }

  const userExists = await User.findOne({ email });

  if (userExists) {
    errorResponse(
      res,
      "A user with same email already registered",
      statusCodes.CONFLICT
    );
  }

  let otpCode = generateOTP(4);

  const user = await User.create({
    email,
    password,
    otpCode,
  });

  if (user) {
    let data = {
      message:
        "For verification of your email, An OTP code has been sent to your email.",
      user: user._doc,
      token: generateToken(user._id),
    };
    successResponse(res, data, statusCodes.CREATED);
    await sendMail(email, "OTP Verification", generateOTPEmailContent(otpCode));
  } else {
    errorResponse(res, "Invalid user data", statusCodes.BAD_REQUEST);
  }
});

// @desc    Auth user & get token
// @route   POST /api/v1/users/login
// @access  Public
const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  // Validate request body
  const { error } = registerUserSchema.validate(req.body);
  if (error) {
    errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
    return;
  }

  const user = await User.findOne({ email });

  if (!user) {
    errorResponse(res, "Email not found", statusCodes.UNAUTHORIZED);
    return;
  }

  // Validate password
  if (!(await user.matchPassword(password))) {
    errorResponse(res, "Invalid Password", statusCodes.UNAUTHORIZED);
    return;
  }

  if (
    user &&
    (await user.matchPassword(password)) &&
    user.role !== Roles.COMMUNITY
  ) {
    let data = {
      message: "You have successfully Logged In.",
      user: user._doc,
      token: generateToken(user._id),
    };

    successResponse(res, data, statusCodes.OK);
  } else if (
    user &&
    (await user.matchPassword(password)) &&
    user.role === Roles.COMMUNITY
  ) {
    let community = await CommunityCenter.findOne({ email });
    if (community) {
      let data = {
        message: "You have successfully Logged In.",
        user: { ...community._doc, role: user.role },
        token: generateToken(user._id),
      };

      successResponse(res, data, statusCodes.OK);
    }
  }
});

// @desc    Update user profile
// @route   PUT /api/v1/users/updateProfile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    // Validate request body
    const { error } = userSchema.validate(req.body);
    if (error) {
      errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
      return;
    }

    // Update user profile fields
    user.firstName = req.body.firstName;
    user.lastName = req.body.lastName;
    user.displayName = req.body.displayName;
    user.birthdate = req.body.birthdate;
    user.height = req.body.height;
    user.position = req.body.position;
    user.radius = req.body.radius;
    user.address = req.body.address;
    user.profilePhoto = req.body.profilePhoto;
    user.timeSlots = req.body.timeSlots;
    user.isCompletedProfile = true;

    // Save updated user
    const updatedUser = await user.save();

    // Send response with updated user and token
    let data = {
      message: "Your profile has been successfully updated.",
      user: updatedUser,
      token: generateToken(updatedUser._id),
    };

    successResponse(res, data, statusCodes.OK);
  } else {
    errorResponse(res, "User not found", statusCodes.NOT_FOUND);
  }
});

// @desc    Social Auth
// @route   POST /api/v1/users/socialAuth
// @access  Public
const socialAuth = asyncHandler(async (req, res) => {
  const { socialId, socialPlatform, email, name } = req.body;

  // Validate request body
  const { error } = socailSignUpUserSchema.validate(req.body);
  if (error) {
    errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
    return;
  }

  const { firstName, lastName } = extractFirstAndLastName(name);

  const userExists = await User.findOne({ email });

  if (userExists && !userExists.socialId) {
    errorResponse(
      res,
      "You have already registered by this email using email and password, please use your email and password to login",
      statusCodes.BAD_REQUEST
    );
  } else if (userExists && userExists.socialId) {
    let data = {
      message: "You have successfully Logged In.",
      user: userExists,
      token: generateToken(userExists._id),
    };
    successResponse(res, data, statusCodes.OK);
  } else {
    const user = await User.create({
      email,
      firstName,
      lastName,
      socialId,
      socialPlatform,
      isEmailVerified: true,
    });

    if (user) {
      let data = {
        message: "Your account has been successfully created.",
        user: user._doc,
        token: generateToken(user._id),
      };
      successResponse(res, data, statusCodes.CREATED);
    } else {
      errorResponse(res, "Invalid user data", statusCodes.BAD_REQUEST);
    }
  }
});

// @desc    Get user profile
// @route   GET /api/v1/users/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    let data = {
      message: "Profile details has been successfully fetched.",
      user: user._doc,
    };
    successResponse(res, data, statusCodes.OK);
  } else {
    errorResponse(res, "User Not Found", statusCodes.NOT_FOUND);
  }
});

// @desc    Send Email Within OTP
// @route   Post /api/v1/users/sendOTP
// @access  Public
const sendOTP = asyncHandler(async (req, res) => {
  // Validate request body
  const { error } = sendOtpSchema.validate(req.body);
  if (error) {
    errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
    return;
  }
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (user) {
    let otp = generateOTP(4);
    user.otpCode = otp;

    await sendMail(email, "OTP Verification", generateOTPEmailContent(otp));
    await user.save();
    let data = {
      message: "One Time Password has been sent on your registered email.",
    };
    successResponse(res, data, statusCodes.OK);
  } else {
    errorResponse(res, "User Not Found", statusCodes.NOT_FOUND);
  }
});

// @desc    VerifyOTPCode
// @route   Post /api/v1/users/verifyOTP
// @access  Public
const verifyOTPCode = asyncHandler(async (req, res) => {
  // Validate request body
  const { error } = verifyOTPSchema.validate(req.body);
  if (error) {
    errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
    return;
  }
  const { email, otpCode } = req.body;
  const user = await User.findOne({ email });

  if (user && user.otpCode === otpCode) {
    user.otpCode = null;
    await user.save();
    let data = {
      message: "OTP code has been successfully verified.",
    };
    successResponse(res, data, statusCodes.OK);
  } else if (user && user.otpCode !== otpCode) {
    errorResponse(res, "Invalid OTP code", statusCodes.BAD_REQUEST);
  } else {
    errorResponse(res, "User Not Found", statusCodes.NOT_FOUND);
  }
});

// @desc    Reset Password
// @route   POST /api/v1/users/resetPassword
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  // Validate request body
  const { error } = registerUserSchema.validate(req.body);
  if (error) {
    errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
    return;
  }

  const { email, password } = req.body;

  const userExists = await User.findOne({ email });

  if (!userExists) {
    errorResponse(res, "User Not found", statusCodes.NOT_FOUND);
  } else if (userExists) {
    userExists.password = password;
    await userExists.save();
    let data = {
      message: "Your password has been reset successfully.",
    };
    successResponse(res, data, statusCodes.OK);
  } else {
    errorResponse(res, "Invalid user data", statusCodes.BAD_REQUEST);
  }
});

// @desc    Verify account email
// @route   Post /api/v1/users/verifyAccountEmail
// @access  Public
const verifyAccountEmail = asyncHandler(async (req, res) => {
  // Validate request body
  const { error } = verifyOTPSchema.validate(req.body);
  if (error) {
    errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
    return;
  }
  const { email, otpCode } = req.body;
  const user = await User.findOne({ email });

  if (user && user.otpCode === otpCode) {
    user.otpCode = null;
    user.isEmailVerified = true;
    await user.save();
    let data = {
      message: "Your email has been successfully verified.",
      user: user,
      token: generateToken(user._id),
    };
    successResponse(res, data, statusCodes.OK);
  } else if (user && user.otpCode !== otpCode) {
    errorResponse(res, "Invalid OTP code", statusCodes.BAD_REQUEST);
  } else {
    errorResponse(res, "User Not Found", statusCodes.NOT_FOUND);
  }
});

export {
  registerUser,
  authUser,
  updateUserProfile,
  socialAuth,
  getUserProfile,
  sendOTP,
  verifyOTPCode,
  resetPassword,
  verifyAccountEmail,
};
