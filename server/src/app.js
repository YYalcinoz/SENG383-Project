const express = require('express');
const authRoutes = require('./routes/auth');
const childrenRoutes = require('./routes/children');
const specialistRoutes = require('./routes/specialists');

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/children/:childId/specialists', specialistRoutes);

// Tüm hatalar { error } biçiminde dönsün; 500'lerde iç detay sızmasın
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

module.exports = app;