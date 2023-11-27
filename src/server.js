require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const mysql = require('mysql');
const path = require('path');
const bcrypt = require('bcrypt');
const { validationResult ,body} = require('express-validator');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/build')));

const prisma = new PrismaClient();

/* const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
}); */

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    process.exit(1);
  }
  console.log('Connected to the database');
});

app.get('/api/events', async (req, res) => {
  try {
    const events = await prisma.events.findMany();
    res.json(events);
  } catch (error) {
    console.error('Error retrieving events:', error);
    res.status(500).json({ error: 'Failed to retrieve events' });
  }
});

app.get('/api/schools', async (req, res) => {
  try {
    const schools = await prisma.schools.findMany();
    res.json(schools);
  } catch (error) {
    console.error('Error retrieving schools:', error);
    res.status(500).json({ error: 'Failed to retrieve schools' });
  }
});

app.get('/api/announcements', async (req, res) => {
  try {
    const announcements = await prisma.announcements.findMany();
    res.json(announcements);
  } catch (error) {
    console.error('Error retrieving announcements:', error);
    res.status(500).json({ error: 'Failed to retrieve announcements' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const admin = await prisma.admin.findUnique({ where: { username } });
    const showadmin = await prisma.showadmin.findUnique({ where: { username } });
    const superadmin = await prisma.superadmin.findUnique({ where: { username } });

    const user = admin || showadmin || superadmin;

    if (!user) {
      return res.status(401).json({ error: 'Invalid username' });
    }

    bcrypt.compare(password, user.password, function (err, isMatch) {
      if (err) {
        console.error('Error while comparing passwords:', err);
        return res.status(500).json({ error: 'Failed to authenticate' });
      }

      if (!isMatch) {
        console.log('Invalid password:', password);
        return res.status(401).json({ error: 'Invalid password' });
      }

      const role = user.role.toLowerCase(); // Assuming you have a 'role' field in the database

      console.log(`${role} Login successful:`, { username, role });
      res.json({ message: 'Login successful', role });
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Failed to authenticate' });
  }
});

// Get showadmins
app.get('/api/showadmins', async (req, res) => {
  try {
    const showadmins = await prisma.showadmin.findMany({
      select: { username: true, contact_number: true },
    });
    res.json(showadmins);
  } catch (error) {
    console.error('Error retrieving show admins:', error);
    res.status(500).json({ error: 'Failed to retrieve show admins' });
  }
});

// Get admins
app.get('/api/admins', async (req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      select: { username: true, contact_number: true },
    });
    res.json(admins);
  } catch (error) {
    console.error('Error retrieving admins:', error);
    res.status(500).json({ error: 'Failed to retrieve admins' });
  }
});

// Update showadmin to admin
app.put('/api/showadmins/:username', async (req, res) => {
  const { username } = req.params;
  const { contact_number } = req.body;

  try {
    const showadmin = await prisma.showadmin.findUnique({ where: { username } });

    if (!showadmin) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password } = showadmin;

    await prisma.showadmin.delete({ where: { username } });

    await prisma.admin.create({
      data: { username, password, contact_number },
    });

    res.json({ message: 'Admin status updated' });
  } catch (error) {
    console.error('Error updating showadmin to admin:', error);
    res.status(500).json({ error: 'Failed to update admin status' });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const admins = await prisma.admin.findMany({
      select: { username: true, contact_number: true, role: { select: { admin: true } } },
    });
    const showadmins = await prisma.showadmin.findMany({
      select: { username: true, contact_number: true, role: { select: { showadmin: true } } },
    });

    const allUsers = [...admins.map(user => ({ ...user, role: 'admin' })), ...showadmins.map(user => ({ ...user, role: 'showadmin' }))];

    res.json(allUsers);
  } catch (error) {
    console.error('Error retrieving users:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Change user password
app.post(
  '/api/changePassword', 
  [
    body('username').notEmpty().withMessage('Username is required').bail().isString().withMessage('Username must be a string'),
    body('password').notEmpty().withMessage('Password is required').bail().isString().withMessage('Password must be a string'),
    body('role').notEmpty().withMessage('Role is required').bail().isIn(['admin', 'showadmin']).withMessage('Invalid user role')
  ], 
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { username, password, role } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      if (role === 'showadmin') {
        await prisma.showadmin.update({
          where: { username },
          data: { password: hashedPassword },
        });
      } else if (role === 'admin') {
        await prisma.admin.update({
          where: { username },
          data: { password: hashedPassword },
        });
      } else {
        return;
      }

      res.json({ message: 'Password updated successfully' });
    } catch (error) {
      console.error('Error updating password:', error);
      res.status(500).json({ error: 'Failed to update password' });
    }
  }
);

// Make showadmin an admin
app.put('/api/makeAdmin/:username', async (req, res) => {
  const { username } = req.params;
  const { contact_number } = req.body;

  try {
    const showadmin = await prisma.showadmin.findUnique({ where: { username } });

    if (!showadmin) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password } = showadmin;

    await prisma.showadmin.delete({ where: { username } });

    await prisma.admin.create({
      data: { username, password, contact_number },
    });

    res.json({ message: 'Admin status updated' });
  } catch (error) {
    console.error('Error updating showadmin to admin:', error);
    res.status(500).json({ error: 'Failed to update admin status' });
  }
});

// Remove admin status
app.put('/api/removeAdmin/:username', async (req, res) => {
  const { username } = req.params;

  try {
    await prisma.admin.delete({ where: { username } });
    res.json({ message: 'Admin removed' });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ error: 'Failed to remove admin' });
  }
});

// Create user
app.post('/api/createUser',
  [
    body('username').notEmpty().withMessage('Username is required').bail().isString().withMessage('Username must be a string'),
    body('password').notEmpty().withMessage('Password is required').bail().isString().withMessage('Password must be a string'),
    body('contact_number').notEmpty().withMessage('Contact Number is required').bail().isString().withMessage('Contact Number must be a string'),
    body('role').notEmpty().withMessage('Role is required').bail().isIn(['admin', 'showadmin']).withMessage('Invalid user role')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, contact_number, role } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      if (role === 'showadmin') {
        await prisma.showadmin.create({
          data: { username, password: hashedPassword, contact_number },
        });
      } else if (role === 'admin') {
        await prisma.admin.create({
          data: { username, password: hashedPassword, contact_number },
        });
      } else {
        return;
      }

      res.json({ message: 'User created successfully' });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Remove showadmin
app.put('/api/removeShowAdmin/:username', async (req, res) => {
  const { username } = req.params;

  try {
    await prisma.showadmin.delete({ where: { username } });
    res.json({ message: 'Show admin removed' });
  } catch (error) {
    console.error('Error deleting show admin:', error);
    res.status(500).json({ error: 'Failed to remove show admin' });
  }
});

// Update latitude and longitude for a school
app.put('/api/schools/:id', async (req, res) => {
  const { id } = req.params;
  const { latitude, longitude } = req.body;

  try {
    await prisma.schools.update({
      where: { id: parseInt(id) },
      data: { latitude, longitude },
    });

    res.json({ message: 'Latitude and longitude updated successfully' });
  } catch (error) {
    console.error('Error updating latitude and longitude:', error);
    res.status(500).json({ error: 'Failed to update latitude and longitude' });
  }
});

// Remove a school
app.delete('/api/schools/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.schools.delete({ where: { id: parseInt(id) } });

    res.json({ message: 'School removed successfully' });
  } catch (error) {
    console.error('Error removing school:', error);
    res.status(500).json({ error: 'Failed to remove school' });
  }
});

// Add a new school
app.post('/api/schools', async (req, res) => {
  const {
    college_name,
    state_name,
    active_riders,
    is_anchor_school,
    region_number,
    zone_number,
    latitude,
    longitude,
    zone_chair,
    region_head,
  } = req.body;

  try {
    await prisma.schools.create({
      data: {
        college_name,
        state_name,
        active_riders,
        is_anchor_school,
        region_number,
        zone_number,
        latitude,
        longitude,
        zone_chair,
        region_head,
      },
    });

    res.json({ message: `Successfully added "${college_name}"` });
  } catch (error) {
    console.error('Error adding school:', error);
    res.status(500).json({ error: 'Failed to add school' });
  }
});

// Create a new event
app.post('/api/events', async (req, res) => {
  const {
    image,
    name,
    venue,
    region,
    zone,
    discipline,
    description,
    start_date,
    start_time,
    end_date,
    end_time,
    time_zone,
    gallery,
  } = req.body;

  try {
    await prisma.events.create({
      data: {
        image,
        name,
        venue,
        region,
        zone,
        discipline,
        description,
        start_date,
        start_time,
        end_date,
        end_time,
        time_zone,
        gallery,
      },
    });

    res.json({ message: `Successfully created event "${name}"` });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update an event
app.put('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  const updatedEvent = req.body;

  try {
    await prisma.events.update({
      where: { id: parseInt(id) },
      data: updatedEvent,
    });

    res.json({ message: 'Event updated successfully' });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete an event
app.delete('/api/events/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.events.delete({ where: { id: parseInt(id) } });

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Create a new announcement
app.post('/api/announcements', async (req, res) => {
  const { title, content, date, time } = req.body;

  try {
    await prisma.announcements.create({
      data: { title, content, date, time },
    });

    res.json({ message: 'Announcement created successfully' });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Update an announcement
app.put('/api/announcements/:id', async (req, res) => {
  const { id } = req.params;
  const updatedAnnouncement = req.body;

  try {
    await prisma.announcements.update({
      where: { id: parseInt(id) },
      data: updatedAnnouncement,
    });

    res.json({ message: 'Announcement updated successfully' });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// Delete an announcement
app.delete('/api/announcements/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.announcements.delete({ where: { id: parseInt(id) } });

    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// Update admin details
app.put('/api/admins/:username', async (req, res) => {
  const { username } = req.params;
  const { newUsername, contact_number } = req.body;

  try {
    await prisma.admins.update({
      where: { username },
      data: { username: newUsername, contact_number },
    });

    res.json({ message: 'Admin username and contact number updated successfully' });
  } catch (error) {
    console.error('Error updating admin username and contact number:', error);
    res.status(500).json({ error: 'Failed to update admin username and contact number' });
  }
});

// Update showadmin details
app.put('/api/showadmins/:username', async (req, res) => {
  const { username } = req.params;
  const { newUsername, contact_number } = req.body;

  try {
    await prisma.showadmins.update({
      where: { username },
      data: { username: newUsername, contact_number },
    });

    res.json({ message: 'ShowAdmin username and contact number updated successfully' });
  } catch (error) {
    console.error('Error updating showadmin username and contact number:', error);
    res.status(500).json({ error: 'Failed to update showadmin username and contact number' });
  }
});

// Update password
app.put('/api/updatePassword/:username', async (req, res) => {
  const { username } = req.params;
  const { newPassword, role } = req.body;

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  try {
    if (role === 'admin') {
      await prisma.admins.update({
        where: { username },
        data: { password: hashedPassword },
      });
    } else if (role === 'showadmin') {
      await prisma.showadmins.update({
        where: { username },
        data: { password: hashedPassword },
      });
    } else {
      return res.status(400).json({ error: 'Invalid user role' });
    }

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// Fetch superadmin username
app.get('/api/superadmin', async (req, res) => {
  try {
    const superadmin = await prisma.superadmin.findUnique({
      select: { username: true },
    });

    if (superadmin) {
      res.json({ superadminUsername: superadmin.username });
    } else {
      res.status(404).json({ error: 'Superadmin username not found' });
    }
  } catch (error) {
    console.error('Error retrieving superadmin username:', error);
    res.status(500).json({ error: 'Failed to retrieve superadmin username' });
  }
});

app.listen(process.env.PORT || 8000, () => {
  console.log(`Server is running on port ${process.env.PORT || 8000}`);
});
