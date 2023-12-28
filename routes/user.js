const express = require('express');
const router = express.Router();

const user = [
    {
        firstName: 'Dhruvin',
        MiddleName:'Maheshbhai',
        lastName: 'Patel',
        email: 'patel.dhruvinpatel@gmail.com',
        password: 'Dhruvin@123',
        mobile: '7874611716',
        familyId: 425050,
        uId: 'fjhsdfjksdf',
        active: true,
        allowed: true
    },
];

router.get('/list', (req, res) => {
    res.json(user)
})

module.exports = router;