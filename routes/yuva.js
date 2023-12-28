const express = require('express');
const router = express.Router();

const yuva = [
    {
        firstName: 'Dhruvin',
    },
];

router.get('/list', (req, res) => {
    res.json(user)
})

module.exports = router;