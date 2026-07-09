const { ValidationError } = require('../utils/errors');

function formatZodError(zodError) {
  return zodError.errors.map((e) => e.message).join('; ');
}

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new ValidationError(formatZodError(result.error)));
    }
    req.body = result.data;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(new ValidationError(formatZodError(result.error)));
    }
    req.query = result.data;
    next();
  };
}

module.exports = { validateBody, validateQuery };
