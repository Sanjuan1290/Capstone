const { getSemaphoreBalance } = require('../utils/semaphoreBalance')

const getCredits = async (req, res) => {
  try {
    const data = await getSemaphoreBalance({ refresh: req.query?.refresh === '1' })
    res.set('Cache-Control', 'private, no-store')
    res.json(data)
  } catch (error) {
    res.set('Cache-Control', 'private, no-store')
    res.status(error.statusCode || 502).json({ message: error.message })
  }
}
module.exports = { getCredits }
