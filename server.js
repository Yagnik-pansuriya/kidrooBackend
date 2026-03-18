const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Basic API route
app.get('/api', (req, res) => {
  res.json({ message: 'Hello, your API is working!', status: 'success' });
});

// Another sample route
app.get('/api/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date() });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
