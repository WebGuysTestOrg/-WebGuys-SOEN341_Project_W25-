const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Load API key from environment variable for security
// In production, this should be set as an environment variable
// For development, we're using a placeholder
const API_KEY = process.env.GOOGLE_API_KEY || "API_KEY_PLACEHOLDER";

// Initialize the AI model
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Middleware to check authentication
const ensureAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
};

// Initialize AI service
router.get('/init-ai-service', ensureAuthenticated, (req, res) => {
  try {
    // This just confirms the server has the API key configured
    // No actual API key is sent to the client
    res.status(200).json({ 
      initialized: true,
      message: 'AI service initialized successfully' 
    });
  } catch (error) {
    console.error('Error initializing AI service:', error);
    res.status(500).json({ 
      error: 'Failed to initialize AI service',
      message: error.message 
    });
  }
});

// Generate content through server-side proxy
router.post('/generate-content', ensureAuthenticated, async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Log the user making the request (for potential rate limiting or auditing)
    console.log(`AI request from user: ${req.session.user.name} (${req.session.user.id})`);
    
    // Generate content using the API key securely on the server side
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    res.status(200).json({ text });
  } catch (error) {
    console.error('Error generating content:', error);
    res.status(500).json({ 
      error: 'Failed to generate content',
      message: error.message 
    });
  }
});

// Legacy endpoint for backward compatibility during transition
// This should be removed in production
router.post('/generate-content-legacy', ensureAuthenticated, async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // Generate content using the API key securely on the server side
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    res.status(200).json({ text });
  } catch (error) {
    console.error('Error generating content (legacy):', error);
    res.status(500).json({ 
      error: 'Failed to generate content',
      message: error.message 
    });
  }
});

module.exports = router; 