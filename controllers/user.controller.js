import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { generateToken } from "../services/generateToken.service.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import {
  registerUserSchema,
  userSchema,
} from "../validators/user.validator.js";

// @desc    Register a new user
// @route   POST /api/users/register
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

  const user = await User.create({
    email,
    password,
  });

  if (user) {
    let data = {
      user: user._doc,
      token: generateToken(user._id),
    };
    successResponse(res, data, statusCodes.CREATED);
  } else {
    errorResponse(res, "Invalid user data", statusCodes.BAD_REQUEST);
    res.status(statusCodes.BAD_REQUEST);
  }
});

// @desc    Auth user & get token
// @route   POST /api/users/login
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

  if (user && (await user.matchPassword(password))) {
    let data = {
      user: user._doc,
      token: generateToken(user._id),
    };

    successResponse(res, data, statusCodes.CREATED);
  }
});

// @desc    Update user profile
// @route   PUT /api/users/updateProfile
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
      user: updatedUser,
      token: generateToken(updatedUser._id),
    };

    successResponse(res, data, statusCodes.OK);
  } else {
    errorResponse(res, "User not found", statusCodes.NOT_FOUND);
  }
});

export { registerUser, authUser, updateUserProfile };
