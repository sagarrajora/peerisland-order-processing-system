const express = require('express');
const orderRoutes = require('./routes/orderRoutes');
const errorHandler = require('./middleware/errorHandler');
const { ValidationError } = require('./utils/errors');

function createApp() {
  const app = express();
  app.use(express.json());

  // Malformed JSON bodies are thrown by express.json() as a SyntaxError
  // before any route runs; surface it as a normal validation error instead
  // of a generic 500.
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return next(new ValidationError('Request body must be valid JSON'));
    }
    next(err);
  });

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/orders', orderRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorHandler);

  return app;
}

module.exports = createApp;
