import Joi from "joi";

//Apply Validation when Sign UP / Login
export const registerUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
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
  profilePhoto: Joi.string(),
});

//Apply For social signup
export const socailSignUpUserSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().required(),
  socialId: Joi.string().required(),
  socialPlatform: Joi.string().required(),
});

// send otp schema 
export const sendOtpSchema = Joi.object({
  email: Joi.string().email().required()
})

// verify otp schema 
export const verifyOTPSchema = Joi.object({
  email: Joi.string().email().required(),
  otpCode: Joi.string().required(),
})
 