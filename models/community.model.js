import mongoose from "mongoose";
import { BookingStatus } from "../constants/common.constant.js";
const Schema = mongoose.Schema;

// Define Booking Schema
const bookingSchema = new Schema(
  {
    bookingDate: {
      type: Date,
    },
    bookedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      default: BookingStatus.PENDING,
    },
  },
  {
    timestamps: true, // Include timestamps for slots
  }
);

// Define a schema for slots within communityTimeSlots
const slotSchema = new Schema(
  {
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    bookings: [bookingSchema],
  },
  {
    timestamps: true, // Include timestamps for slots
  }
);

// Define a schema for communityTimeSlots
const communityTimeSlotSchema = new Schema(
  {
    day: {
      type: String,
      required: true,
    },
    slots: [slotSchema], // Array of slots with their own schema
  },
  {
    timestamps: true, // Include timestamps for communityTimeSlots
  }
);

// Define Community Center Schema
const communityCenterSchema = new Schema(
  {
    name: {
      type: String,
      // required: true,
      default: null,
    },
    email: {
      type: String,
      default: null,
      // required: true,
    },
    image: {
      type: String,
      default: null, // Assuming you store the image URL
      // required: true,
    },
    _location: {
      type: {
        type: String, // Must be 'Point' for GeoJSON
        enum: ["Point"], // Only 'Point' is allowed
        default: "Point",
        // required: true,
      },
      coordinates: {
        type: [Number], // Array of numbers [longitude, latitude]
        // required: true,
      },
    },
    location: {
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
    },
    address: {
      type: String,
      default: null,
      // required: true,
    },
    description: {
      type: String,
      default: null,
    },
    price: {
      type: Number,
      default: 0,
    },
    communityTimeSlots: [communityTimeSlotSchema],
    community_user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    }, // Reference to a single User model
  },
  {
    timestamps: true,
  }
);

const CommunityCenter = mongoose.model(
  "CommunityCenter",
  communityCenterSchema
);

export { CommunityCenter };
