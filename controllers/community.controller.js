import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { Roles } from "../constants/role.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { addSlotsSchema, communityCenterSchema } from "../validators/community.validator.js";
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

  const { name, email, image, location, address, password, description } =
    req.body;

  const userExists = await User.findOne({ email });

  if (userExists) {
    errorResponse(
      res,
      "A user with same email already registered",
      statusCodes.CONFLICT
    );
  }

  let coordinates = [location.longitude, location.latitude];
  let _location = {
    type: "Point",
    coordinates,
  };
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
      description,
      _location,
      location,
      community_user: user._id,
    });
    delete communityUser._doc._location
    let data = {
      message: "Community user have been added successfully.",
      community_user: {
        community_id: communityUser._id,
        ...communityUser._doc,
      },
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

// @desc    Add slots
// @route   POST /api/v1/community/addSlots
// @access  Private
const addSlots = asyncHandler(async (req, res) => {
  // Validate request body
  const { error } = addSlotsSchema.validate(req.body);
  if (error) {
    errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
    return;
  }

  const { community_id, communityTimeSlots } = req.body;

  let findCommunity = await CommunityCenter.findById(community_id);

  if (!findCommunity) {
    errorResponse(res, "No community center found", statusCodes.NOT_FOUND);
  }

  findCommunity.communityTimeSlots = communityTimeSlots;
  const updatedCommunity = await findCommunity.save();
  delete updatedCommunity._doc._location
  let data = {
    message: "Slots have been added successfully!",
    community_user: {
      community_id: updatedCommunity._id,
      ...updatedCommunity._doc,
    },
  };
  successResponse(res, data, statusCodes.CREATED);
});

// @desc    Get Single community based on id
// @route   GET /api/v1/community/:id
// @access  Private
const getCommunityDetail = asyncHandler(async (req, res) => {
  let community_id = req.params.id
  if(!community_id){
    errorResponse(res, "No community center found", statusCodes.NOT_FOUND);
  }
  const findCommunity = await CommunityCenter.findById(community_id);

  if (findCommunity) {
    delete findCommunity._doc._location
    let data = {
      message: "Community center detail have been fetched successfully!",
      community_user: {
        community_id: findCommunity._id,
        ...findCommunity._doc,
      },
    };
    successResponse(res, data, statusCodes.OK);
  } else {
    errorResponse(res, "No community center found", statusCodes.NOT_FOUND);
  }
});

export { getCommunities, registerCommunity, addSlots, getCommunityDetail };
