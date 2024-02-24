// authMiddleware.js
const admin = require('firebase-admin');

const authenticateRequest = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'Unauthorized' });
  }

  const idToken = header.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // Attach the decoded token to the request object
    next();
  } catch (error) {
    console.error('Error verifying ID token:', error);
    res.status(403).send({ message: 'Forbidden' });
  }
};

module.exports = authenticateRequest;
