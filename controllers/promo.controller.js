import asyncHandler from "express-async-handler";
import { promoCodeValidationSchema } from "../validators/promo.validator.js";
import { PromoCode } from "../models/promo-code.model.js";
import { errorResponse, successResponse } from "../helpers/response.helper.js";
import { statusCodes } from "../constants/statusCodes.constant.js";

const addPromoCode = asyncHandler(async (req, res) => {
  // Validate the request body
  const { error } = promoCodeValidationSchema.validate(req.body);

  if (error) {
    errorResponse(res, error.details[0].message, statusCodes.BAD_REQUEST);
    return;
  }

  // Extract validated data
  const { code, discount, expiryDate, maxUsage } = req.body;

  try {
    // Create a new promo code
    const promoCode = new PromoCode({
      code,
      discount,
      expiryDate,
      maxUsage,
      usageCount: 0, // Default to 0
    });

    // Save the promo code to the database
    await promoCode.save();

    let data = {
      message: "Promo Code created successfully.",
      promoCode,
    };
    successResponse(res, data, statusCodes.CREATED);
  } catch (err) {
    errorResponse(res, "Invalid user data", statusCodes.BAD_REQUEST);
  }
});

const verifyPromoCode = asyncHandler(async (req, res) => {
    const { code } = req.body;
  
    try {
      const promoCode = await PromoCode.findOne({ code });
  
      if (!promoCode) {
        return errorResponse(res, 'Promo code not found', statusCodes.NOT_FOUND);
      }
  
      if (promoCode.expiryDate < new Date()) {
        return errorResponse(res, 'Promo code has expired', statusCodes.BAD_REQUEST);
      }
  
      if (promoCode.usageCount >= promoCode.maxUsage) {
        return errorResponse(res, 'Promo code usage limit reached', statusCodes.BAD_REQUEST);
      }
  
      // Increment the usage count
      promoCode.usageCount += 1;
      await promoCode.save();
  
      // If the promo code is valid, return its details
      const data = {
        message: 'Promo code is valid',
        discount: promoCode.discount,
        code: promoCode.code,
        expiryDate: promoCode.expiryDate,
        maxUsage: promoCode.maxUsage,
        usageCount: promoCode.usageCount,
      };
      successResponse(res, data, statusCodes.OK);
    } catch (err) {
      errorResponse(res, 'An error occurred while verifying the promo code', statusCodes.INTERNAL_SERVER_ERROR);
    }
  });

export { addPromoCode, verifyPromoCode };
