import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { Roles } from "../constants/role.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { communityCenterSchema } from "../validators/community.validator.js";
import { CommunityCenter } from "../models/community.model.js";
import {
  generateCommunityCenterCredentialEmailContent,
  sendMail,
} from "../services/email.service.js";

// @desc    Get communities list
// @route   GET /api/v1/community/getAll
// @access  Private
const getCommunities = asyncHandler(async (req, res) => {
  const radius = req.query.radius;
  const page = parseInt(req.query.page) || 1; // Parse page number from request query, default to 1 if not provided
  const limit = parseInt(req.query.limit) || 10; // Parse limit from request query, default to 10 if not provided
  const searchTerm = req.query.searchTerm; // Search term from request query

  let query = radius ? { radius: { $lte: radius } } : {};

  if (searchTerm) {
    const searchRegex = new RegExp(searchTerm, "i"); // Case-insensitive regex for search term
    query.$or = [
      { name: searchRegex }, // Search in firstName
    ];
  }
  const totalRecords = await CommunityCenter.countDocuments(query);
  const totalCount = await CommunityCenter.countDocuments(query);

  const totalPages = Math.ceil(totalCount / limit);
  const offset = (page - 1) * limit;

  const communities = await CommunityCenter.find(query)
    .skip(offset)
    .limit(limit);

  const message = radius
    ? `Communities within radius ${radius} have been successfully fetched.`
    : "Communities have been successfully fetched.";

  const data = {
    message,
    totalPages,
    currentPage: page,
    communities,
    totalRecords,
  };

  successResponse(res, data, statusCodes.OK);
});

// @desc    Add a new community user
// @route   POST /api/v1/community/register
// @access  Private
const registerCommunity = asyncHandler(async (req, res) => {
  // Validate request body
  const { error } = communityCenterSchema.validate(req.body);
  if (error) {
    errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
    return;
  }

  const { name, email, image, location, address, timeSlots, password, radius, description } =
    req.body;

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
    isEmailVerified: true,
    role: Roles.COMMUNITY,
  });

  if (user) {
    const communityUser = await CommunityCenter.create({
      name,
      email,
      image,
      location,
      address,
      timeSlots,
      radius,
      description,
      community_user: user._id,
    });
    let data = {
      message: "Community user have been added successfully.",
    };
    successResponse(res, data, statusCodes.CREATED);
    await sendMail(
      email,
      "Welcome to Our Platform - Your Login Credentials",
      generateCommunityCenterCredentialEmailContent(name, email, password)
    );
  } else {
    errorResponse(res, "Invalid user data", statusCodes.BAD_REQUEST);
  }
});

export { getCommunities, registerCommunity };
