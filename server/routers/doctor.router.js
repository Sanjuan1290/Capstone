const express = require('express')
const router = express.Router()
const { login, checkAuth, logout } = require('../controllers/doctor.controller')

router.post('/login', login)
router.get('/auth/check', checkAuth)
router.post('/logout', logout)

module.exports = router