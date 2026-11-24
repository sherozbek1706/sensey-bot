const express = require('express');
const router = express.Router();
const repo = require('../../db/repository');
const resellerApi = require('../../services/resellerApi');
const seenSmsApi = require('../../services/seenSmsApi');

router.get('/', async (req, res) => {
  try {
    const stats = repo.getBotStats();
    let resellerHealth = 'ok';
    let balance = 0;

    try {
      const me = await resellerApi.getBalance();
      balance = me.balance;
    } catch (e) {
      resellerHealth = 'degraded: ' + e.message;
    }

    let seenSmsHealth = 'ok';
    let seenSmsBal = 0;
    try {
      const sb = await seenSmsApi.getBalance();
      seenSmsBal = sb.balance;
    } catch (e) {
      seenSmsHealth = 'degraded: ' + e.message;
    }

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      resellerApi: {
        status: resellerHealth,
        balanceUsd: balance
      },
      seenSms: {
        status: seenSmsHealth,
        balanceUzs: seenSmsBal
      },
      stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
