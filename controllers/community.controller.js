import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { Roles } from "../constants/role.constant.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import {
  addSlotsSchema,
  communityCenterSchema,
  slotBookingSchema,
  updateCommunityCenterSchema,
} from "../validators/community.validator.js";
import { CommunityCenter } from "../models/community.model.js";
import {
  generateCommunityCenterCredentialEmailContent,
  sendMail,
} from "../services/email.service.js";
import mongoose from "mongoose";
import { getAbbreviatedDayOfWeek } from "../services/common.service.js";

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

  const communities = await CommunityCenter.find(query).select("-communityTimeSlots")
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

  const {
    name,
    email,
    image,
    location,
    address,
    password,
    description,
    price,
  } = req.body;

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
      price,
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

// @desc    Get community slots and its bookings
// @route   GET /api/v1/community/:communityCenterId/:date
// @access  Private
const getCommunitySlots = asyncHandler(async (req, res) => {
  const { communityCenterId, date } = req.params;
  try {
    const communityCenter = await CommunityCenter.findById(communityCenterId);

    if (!communityCenter) {
      return errorResponse(
        res,
        "Community center not found",
        statusCodes.NOT_FOUND
      );
    }

    const targetDate = new Date(date); // Ensure date is in Date format for consistent comparison
    const dayOfWeek = getAbbreviatedDayOfWeek(targetDate);

    const results = await CommunityCenter.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(communityCenterId),
        },
      },
      {
        $unwind: "$communityTimeSlots",
      },
      {
        $match: {
          "communityTimeSlots.day": dayOfWeek,
        },
      },
      {
        $unwind: "$communityTimeSlots.slots",
      },
      {
        $project: {
          slotDetails: "$communityTimeSlots.slots",
          bookings: {
            $filter: {
              input: "$communityTimeSlots.slots.bookings",
              as: "booking",
              cond: { $eq: ["$$booking.bookingDate", targetDate] },
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "bookings.bookedBy",
          foreignField: "_id",
          as: "bookedByDetails",
        },
      },
      {
        $addFields: {
          bookings: {
            $map: {
              input: "$bookings",
              as: "booking",
              in: {
                _id: "$$booking._id",
                createdAt: "$$booking.createdAt",
                updatedAt: "$$booking.updatedAt",
                bookingDate: "$$booking.bookingDate",
                bookedBy: {
                  $arrayElemAt: [
                    "$bookedByDetails",
                    {
                      $indexOfArray: [
                        "$bookedByDetails._id",
                        "$$booking.bookedBy",
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: "$slotDetails._id",
          startTime: "$slotDetails.startTime",
          endTime: "$slotDetails.endTime",
          available: "$slotDetails.available",
          createdAt: "$slotDetails.createdAt",
          updatedAt: "$slotDetails.updatedAt",
          bookings: {
            $ifNull: [
              {
                $map: {
                  input: "$bookings",
                  as: "booking",
                  in: {
                    bookingId: "$$booking._id",
                    bookedBy: {
                      _id: "$$booking.bookedBy._id",
                      firstName: "$$booking.bookedBy.firstName",
                      lastName: "$$booking.bookedBy.lastName",
                      email: "$$booking.bookedBy.email",
                      coins: "$$booking.bookedBy.coins"
                    },
                  },
                },
              },
              [],
            ],
          },
        },
      },
      {
        $group: {
          _id: "$_id",
          startTime: { $first: "$startTime" },
          endTime: { $first: "$endTime" },
          available: { $first: "$available" },
          bookings: { $first: "$bookings" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
        },
      },
      {
        $group: {
          _id: null,
          slots: { $push: "$$ROOT" },
        },
      },
    ]);

    const response = {
      bookingDate: new Date(date).toISOString(),
      communityCenter: {
        _id: communityCenter._id,
        name: communityCenter.name,
        price: communityCenter.price,
      },
      day: dayOfWeek,
      slots: results.map((item) => item.slots).flat(),
    };

    successResponse(res, response, statusCodes.OK);
  } catch (error) {
    console.error(error);
    errorResponse(
      res,
      "Internal server error",
      statusCodes.INTERNAL_SERVER_ERROR
    );
  }
});

// @desc    Add bookings to slot
// @route   POST /api/v1/community/slot/addBooking
// @access  Private

const addBookingToSlot = asyncHandler(async (req, res) => {
  try {
    const { error } = slotBookingSchema.validate(req.body);
    if (error) {
      errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
      return;
    }
    const { communityCenterId, day, slotId, userId, bookingDate } = req.body; // Assuming userId and bookingDate are provided in the request body

    // Find the user
    const user = await User.findById(userId).select("-password, -fcmTokens");
    if (!user) {
      return errorResponse(res, "User not found", statusCodes.NOT_FOUND);
    }

    // Find the community center
    const communityCenter = await CommunityCenter.findById(
      communityCenterId
    ).exec();
    if (!communityCenter) {
      return errorResponse(
        res,
        "Community Center not found",
        statusCodes.NOT_FOUND
      );
    }

    if (user.coins < communityCenter.price) {
      return errorResponse(
        res,
        "You have'nt enough balance to book this slot.",
        statusCodes.BAD_REQUEST
      );
    }

    // Find the day within the community center
    const communityTimeSlots = communityCenter.communityTimeSlots.find(
      (communitySlot) => communitySlot.day == day
    );
    if (!communityTimeSlots) {
      return errorResponse(res, "Day not found", statusCodes.NOT_FOUND);
    }

    // Find the slot within the day
    const slot = communityTimeSlots.slots.find(
      (slot) => slot._id.toString() === slotId
    );
    if (!slot) {
      return errorResponse(res, "Slot not found", statusCodes.NOT_FOUND);
    }

    // Check if the slot has already ten bookings for the same date
    const bookingsForSameDate = slot.bookings.filter(
      (booking) =>
        booking.bookingDate.toDateString() ===
        new Date(bookingDate).toDateString()
    );
    if (bookingsForSameDate.length >= 10) {
      return errorResponse(
        res,
        "No more bookings allowed for the same date as limit for the same date has been reached.",
        statusCodes.BAD_REQUEST
      );
    }

    // Add booking with bookedBy user ID and booking date
    slot.bookings.push({ bookedBy: userId, bookingDate });

    // Save the community center
    const booked = await communityCenter.save();
    user.coins = user.coins - communityCenter.price;
    await user.save();
    let data = {
      message: "Booking has been added successfully.",
      player: user
    };

    successResponse(res, data, statusCodes.CREATED);
  } catch (error) {
    console.error(error);
    errorResponse(
      res,
      "Internal server error",
      statusCodes.INTERNAL_SERVER_ERROR
    );
  }
});

const getCommunitySlotsBasedonDateRange = asyncHandler(async (req, res) => {
  const { communityCenterId, startDate, endDate } = req.query;
  try {
    if (!communityCenterId) {
      return errorResponse(
        res,
        "Community center id is required.",
        statusCodes.NOT_FOUND
      );
    }
    if (!startDate || !endDate) {
      return errorResponse(
        res,
        "Start date / End date is required.",
        statusCodes.NOT_FOUND
      );
    }

    const communityCenter = await CommunityCenter.findById(communityCenterId);
    if (!communityCenter) {
      return errorResponse(
        res,
        "Community center not found",
        statusCodes.NOT_FOUND
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const results = await CommunityCenter.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(communityCenterId),
        },
      },
      {
        $unwind: "$communityTimeSlots",
      },
      {
        $unwind: "$communityTimeSlots.slots",
      },
      {
        $project: {
          slotDetails: "$communityTimeSlots.slots",
          bookings: {
            $filter: {
              input: "$communityTimeSlots.slots.bookings",
              as: "booking",
              cond: {
                $and: [
                  { $gte: ["$$booking.bookingDate", start] },
                  { $lte: ["$$booking.bookingDate", end] },
                ],
              },
            },
          },
        },
      },
      {
        $unwind: "$bookings",
      },
      {
        $lookup: {
          from: "users",
          localField: "bookings.bookedBy",
          foreignField: "_id",
          as: "bookedByDetails",
        },
      },
      {
        $addFields: {
          "bookings.bookedBy": {
            $arrayElemAt: ["$bookedByDetails", 0],
          },
          "bookings.bookingDay": {
            $dayOfWeek: "$bookings.bookingDate",
          },
        },
      },
      {
        $group: {
          _id: {
            bookingDate: "$bookings.bookingDate",
            startTime: "$slotDetails.startTime",
            endTime: "$slotDetails.endTime",
          },
          bookingDay: {
            $first: {
              $arrayElemAt: [
                ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
                { $subtract: ["$bookings.bookingDay", 1] },
              ],
            },
          },
          available: { $first: "$slotDetails.available" },
          createdAt: { $first: "$slotDetails.createdAt" },
          updatedAt: { $first: "$slotDetails.updatedAt" },
          players: {
            $push: {
              bookingId: "$bookings._id",
              status: "$bookings.status",
              bookedBy: {
                _id: "$bookings.bookedBy._id",
                firstName: "$bookings.bookedBy.firstName",
                lastName: "$bookings.bookedBy.lastName",
                email: "$bookings.bookedBy.email",
                profilePhoto: "$bookings.bookedBy.profilePhoto",
                coins: "$bookings.bookedBy.coins"
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          bookingDate: "$_id.bookingDate",
          startTime: "$_id.startTime",
          endTime: "$_id.endTime",
          bookingDay: 1,
          available: 1,
          createdAt: 1,
          updatedAt: 1,
          players: 1,
        },
      },
    ]);

    const response = {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      communityCenter: {
        _id: communityCenter._id,
        name: communityCenter.name,
        price: communityCenter.price,
      },
      bookings: results,
    };

    successResponse(res, response, statusCodes.OK);
  } catch (error) {
    console.error(error);
    errorResponse(
      res,
      "Internal server error",
      statusCodes.INTERNAL_SERVER_ERROR
    );
  }
});

const updateCommunityCenter = asyncHandler(async (req, res) => {
  const { error } = updateCommunityCenterSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  let id = req.body.id;
  delete req.body.id;
  let coordinates = [req.body.location.longitude, req.body.location.latitude];
  let _location = {
    type: "Point",
    coordinates,
  };
  req.body._location = _location;

  try {
    const updatedCommunityCenter = await CommunityCenter.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true,  select: { "_location": 0, "communityTimeSlots": 0 } } // This returns the updated object and ensures validators run
    )

    if (!updatedCommunityCenter) {
      return errorResponse(
        res,
        "Community center not found",
        statusCodes.NOT_FOUND
      );
    }

    let data = {
      message: "Community center updated successfully.",
      updateCommunity: updatedCommunityCenter,
    };
    successResponse(res, data, statusCodes.OK);
  } catch (err) {
    errorResponse(error.message, statusCodes.INTERNAL_SERVER_ERROR);
  }
});

export {
  getCommunities,
  registerCommunity,
  addSlots,
  getCommunityDetail,
  deleteSlot,
  getCommunitySlots,
  addBookingToSlot,
  getCommunitySlotsBasedonDateRange,
  updateCommunityCenter,
};
