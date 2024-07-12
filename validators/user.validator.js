import Joi from "joi";

//Apply Validation when Sign UP / Login
export const registerUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  fcmToken: Joi.string().allow("", null),
  referredBy: Joi.string().optional().allow("", null)
});

//Apply Validation when updating profile
export const userSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  displayName: Joi.string().required(),
  birthdate: Joi.date(),
  height: Joi.string(),
  position: Joi.string().required(),
  address: Joi.string().required(),
  radius: Joi.string().required(),
  profilePhoto: Joi.string(),
  location: Joi.object({
    latitude: Joi.number().required(),
    longitude: Joi.number().required(),
  }),
});

//Apply For social signup
export const socailSignUpUserSchema = Joi.object({
  email: Joi.string().allow(null, '').optional(),
  name: Joi.string().required(),
  socialId: Joi.string().required(),
  socialPlatform: Joi.string().required(),
  fcmToken: Joi.string(),
  referredBy: Joi.string().optional().allow("", null)
});

// send otp schema
export const sendOtpSchema = Joi.object({
  email: Joi.string().email().required(),
});

// verify otp schema
export const verifyOTPSchema = Joi.object({
  email: Joi.string().email().required(),
  otpCode: Joi.string().required(),
});

//Logout schema

export const logoutFCMTokenSchema = Joi.object({
  id: Joi.string().required(),
  fcmToken: Joi.string().required(),
});

//add coins schema
export const coinTransactionSchema = Joi.object({
  inapp_id: Joi.string().allow("", null), // Allow empty string or null, but it should be a string
  platform: Joi.string().required(), // Platform must be a non-empty string
  coins_value: Joi.number().integer().min(1).required(), // coins_value should be a positive integer
  payment_id: Joi.string().allow("", null), // Payment ID can be empty or null, but must be a string if provided
});

export const ratingSchema = Joi.object({
  userId: Joi.string().required(),
  rating: Joi.number().min(1).max(5).required(),
  matchId: Joi.string().required()
});
