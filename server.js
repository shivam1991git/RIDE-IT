const express = require('express')
const app = express()
const port = process.env.PORT || 5000
const dbConnection = require('./db')
app.use(express.json())


app.use('/api/cars/', require('./routes/carsRoute'))
app.use('/api/users/', require('./routes/usersRoute'))
app.use('/api/drivers/', require('./routes/driversRoute'))
app.use('/api/admins/', require('./routes/adminsRoute'))
app.use('/api/bookings/', require('./routes/bookingsRoute'))
app.use('/api/feedbacks/', require('./routes/feedbackRoute')); 
app.get('/',(req,res) => res.send('HELLO WORLd!'))
app.listen(port, () => console.log(`Node js Server started in port ${port}`))
