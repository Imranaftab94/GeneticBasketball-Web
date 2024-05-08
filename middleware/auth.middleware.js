import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import { User } from "../models/user.model.js";
import { statusCodes } from "../constants/statusCodes.constant.js";
import { Roles } from "../constants/role.constant.js";
import { errorResponse } from "../helpers/response.helper.js";

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-password");

      next();
    } catch (error) {
      console.error(error);
      errorResponse(
        res,
        "Unauthorized, Token Failed",
        statusCodes.UNAUTHORIZED
      );
    }
  }

  if (!token) {
    errorResponse(
      res,
      "Unauthorized, Token not found",
      statusCodes.UNAUTHORIZED
    );
  }
});

const admin = (req, res, next) => {
  if (req.user && req.user.role === Roles.ADMIN) {
    next();
  } else {
    errorResponse(
        res,
        "Not Authorized as an Admin",
        statusCodes.UNAUTHORIZED
      );
  }
};

const adminAndCommunity = (req, res, next) => {
  if (req.user && (req.user.role === Roles.ADMIN || req.user.role === Roles.COMMUNITY)) {
    next();
  } else {
    errorResponse(
        res,
        "Not Authorized as an Admin/Community",
        statusCodes.UNAUTHORIZED
      );
  }
};

export { protect, admin, adminAndCommunity };
