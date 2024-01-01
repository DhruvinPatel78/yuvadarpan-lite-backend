const express = require('express');
const router = express.Router();
const Yuva = require('../models/yuva');

router.get('/list', async (req, res) => {
    const dbYuva = await Yuva.find();
    res.json(dbYuva);
})

router.post('/:id', async(req, res) => {
    const dbYuva = await Yuva.findById(req.params.id);
    res.send(dbYuva);
})

router.post('/addYuva', async(req, res) => {
    const yuva = req.body;
    const dbYuva = await Yuva.create(yuva);
    res.send(dbYuva);
})

module.exports = router;