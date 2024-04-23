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
  radius: Joi.number().required(),
  address: Joi.string().required(),
  profilePhoto: Joi.string(),
  timeSlots: Joi.array(),
});
