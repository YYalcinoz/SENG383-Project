const express = require('express');
const authRoutes = require('./routes/auth');
const childrenRoutes = require('./routes/children');
const specialistRoutes = require('./routes/specialists');
const taskRoutes = require('./routes/tasks');
const scheduleRoutes = require('./routes/schedule');
const documentRoutes = require('./routes/documents');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();

// Not rate limited: the E2E setup and other tools poll it to see if the server is up
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Before express.json(), so a client over the limit is rejected before its body is read
app.use('/api', apiLimiter);
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/children/:childId/specialists', specialistRoutes);
app.use('/api/children/:childId/schedule', scheduleRoutes);
app.use('/api/children/:childId/tasks', taskRoutes);
app.use('/api/children/:childId/documents', documentRoutes);

// Tüm hatalar { error } biçiminde dönsün; 500'lerde iç detay sızmasın
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

module.exports = app;