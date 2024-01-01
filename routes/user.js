const express = require('express');
const router = express.Router();
const User = require('../models/user');

router.get('/list', async(req, res) => {
    const users = await User.find();
    res.json(users)
})

router.post('/signUp', async(req, res) => {
    const user = req.body;
    const dbUser = await User.create(user);
    res.send(dbUser);
})

router.post('/signIn', async(req, res) => {
    const user = req.body;
    const dbUser = await User.create(user);
    res.send(dbUser);
})

module.exports = router;