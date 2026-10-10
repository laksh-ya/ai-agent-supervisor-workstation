// Logs method, path, status and latency. Set LOG_REQUESTS=off to silence.
function requestLogger(req, res, next) {
  if (process.env.LOG_REQUESTS === 'off') return next();
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
}

module.exports = requestLogger;
