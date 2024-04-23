export const successResponse = (res, data, statusCode) => {
  res.status(statusCode).json({
    success: true,
    data,
  });
};

export const errorResponse = (res, message, statusCode) => {
  res.status(statusCode).json({
    success: false,
    error: message,
  });
};
