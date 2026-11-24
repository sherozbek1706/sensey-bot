const express = require('express');
const cors = require('cors');
const path = require('path');
const healthRoutes = require('./routes/health');
const paymentRoutes = require('./routes/payments');
const webhookRoutes = require('./routes/webhooks');
const webappRoutes = require('./routes/webapp');

function createApp(bot = null) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Bot instance'ni req ga biriktirish (zarur bo'lsa)
  app.use((req, res, next) => {
    req.bot = bot;
    next();
  });

  // Marshrutlar
  app.use('/health', healthRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/webapp', webappRoutes);

  // WebApp statik fayllari (public/index.html)
  const publicDir = path.join(__dirname, '../../public');
  app.use(express.static(publicDir));

  // /app yo'li ham WebApp'ni ochadi
  app.get('/app', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

module.exports = { createApp };
