
const express = require('express')
const router = express.Router()
const { register, login, checkAuth } = require('../controllers/patient.controller')

router.post('/register', register)
router.post('/login', login)
router.get('/auth/check', checkAuth)

module.exports = router