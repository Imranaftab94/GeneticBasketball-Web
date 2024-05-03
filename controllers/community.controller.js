import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { Roles } from "../constants/role.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import {
  addSlotsSchema,
  communityCenterSchema,
} from "../validators/community.validator.js";
import { CommunityCenter } from "../models/community.model.js";
import {
  generateCommunityCenterCredentialEmailContent,
  sendMail,
} from "../services/email.service.js";

// @desc    Get communities list
// @route   GET /api/v1/community/getAll
// @access  Private
const getCommunities = asyncHandler(async (req, res) => {
  const latitude = req.query.latitude ? parseFloat(req.query.latitude) : null;
  const longitude = req.query.longitude
    ? parseFloat(req.query.longitude)
    : null;
  const radius = req.query.radius ? parseFloat(req.query.radius) : null;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 25;
  const searchTerm = req.query.searchTerm;

  const query = {};

  // Add geospatial search if all necessary parameters are present
  if (latitude && longitude && radius) {
    query._location = {
      $geoWithin: {
        $centerSphere: [
          [longitude, latitude],
          radius / 6378.1, // Radius in radians (radius in kilometers / Earth’s radius in kilometers)
        ],
      },
    };
  }

  // Search by name if searchTerm is provided
  if (searchTerm) {
    const searchRegex = new RegExp(searchTerm, "i"); // Case-insensitive regex for search term
    query.$or = query.$or || []; // Initialize $or if not already initialized
    query.$or.push({ name: searchRegex });
  }

  const totalRecords = await CommunityCenter.countDocuments(query);
  const totalCount = await CommunityCenter.countDocuments(query);

  const totalPages = Math.ceil(totalCount / limit);
  const offset = (page - 1) * limit;

  const communities = await CommunityCenter.find(query)
    .select("-_location")
    .skip(offset)
    .limit(limit);

  const message = `Communities fetched successfully.`;

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
    delete communityUser._doc._location;
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
    return;
  }

  if (communityTimeSlots && communityTimeSlots.length > 0) {
    communityTimeSlots.forEach((newDay) => {
      const existingDay = findCommunity.communityTimeSlots.find(
        (day) => day.day === newDay.day
      );
      if (existingDay) {
        newDay.slots.forEach((newSlot) => {
          const existingSlot = existingDay.slots.find(
            (slot) => slot._id.toString() === newSlot._id
          );
          if (existingSlot) {
            // If _id matches an existing slot, update it
            Object.assign(existingSlot, newSlot);
          } else {
            const sameTimeSlot = existingDay.slots.find(
              (slot) =>
                slot.startTime === newSlot.startTime &&
                slot.endTime === newSlot.endTime
            );
            if (sameTimeSlot) {
              // If a slot with the same start and end times exists, update it
              Object.assign(sameTimeSlot, newSlot);
            } else {
              // If no matching slot is found, add the new slot
              existingDay.slots.push(newSlot);
            }
          }
        });
      } else {
        // If the day is not present, add the entire day with its slots
        findCommunity.communityTimeSlots.push(newDay);
      }
    });
  }

  const updatedCommunity = await findCommunity.save();
  delete updatedCommunity._doc._location;
  let data = {
    message: "Slots have been updated/added successfully!",
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
  let community_id = req.params.id;
  if (!community_id) {
    errorResponse(res, "No community center found", statusCodes.NOT_FOUND);
  }
  const findCommunity = await CommunityCenter.findById(community_id);

  if (findCommunity) {
    delete findCommunity._doc._location;
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

// @desc    Delete slots
// @route   POST /api/v1/community/deleteSlot
// @access  Private

const deleteSlot = asyncHandler(async (req, res) => {
  const communityId = req.params.communityId; // Assuming the community ID is passed as a URL parameter
  const slotId = req.params.slotId; // Assuming the slot ID is passed as a URL parameter

  if (!communityId || !slotId) {
    return res.status(400).json({
      success: false,
      message: "Community ID and Slot ID are required",
    });
  }

  try {
    // First, check if the slot exists
    const community = await CommunityCenter.findOne(
      {
        _id: communityId,
        "communityTimeSlots.slots._id": slotId,
      },
      { "communityTimeSlots.$": 1 }
    ); // Project only the relevant part of communityTimeSlots

    if (!community) {
      errorResponse(
        res,
        "No slot found with provided ID",
        statusCodes.NOT_FOUND
      );
    }

    // Update community document to pull (remove) the slot with the given slotId
    const result = await CommunityCenter.updateOne(
      { _id: communityId },
      { $pull: { "communityTimeSlots.$[].slots": { _id: slotId } } } // The positional $[] operator indicates to MongoDB to search in all documents in the communityTimeSlots array.
    );

    if (result.modifiedCount === 0) {
      return errorResponse(
        res,
        "No slot found or no changes made",
        statusCodes.NOT_FOUND
      );
    }

    successResponse(res, result, statusCodes.OK);
  } catch (error) {
    errorResponse(error.message, statusCodes.INTERNAL_SERVER_ERROR);
  }
});

export {
  getCommunities,
  registerCommunity,
  addSlots,
  getCommunityDetail,
  deleteSlot,
};
