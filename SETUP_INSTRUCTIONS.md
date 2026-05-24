# Pre-Deployment Setup Script

This file contains all the commands you need to run before deploying to make sure everything is set up correctly.

## 1. Install CORS Package (if not already installed)

Run this in your project root (same level as server.js):

```powershell
npm install cors
```

This adds Cross-Origin Resource Sharing support for production.

## 2. Verify .env Configuration

Your `.env` file should have:

```env
PORT=5000
MONGO_URI=mongodb+srv://shivam-singh:YOUR_PASSWORD@cluster0.25rsjmw.mongodb.net/ride-it
MONGO_DB_NAME=ride-it
JWT_SECRET=your-long-random-secret-minimum-32-characters
STRIPE_SECRET_KEY=sk_test_your_stripe_key
```

**Important:** 
- Never commit .env to GitHub
- Create new, strong passwords for MongoDB in production
- Change `JWT_SECRET` to a random string (minimum 32 characters)

## 3. Frontend Setup

In the `client/` folder, create `.env.local`:

```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_STRIPE_PUBLIC_KEY=pk_test_your_public_key
```

This file is in `.gitignore` - it won't be pushed to GitHub.

## 4. Test Locally

```powershell
# Terminal 1: Start backend
npm start

# Terminal 2: Start frontend
cd client
npm start
```

Both should run without errors.

## 5. Prepare Git

```powershell
# Check what will be committed (should not include .env or node_modules)
git status

# Stage changes
git add .

# Commit
git commit -m "Production-ready setup with CORS and environment variables"

# Push to GitHub
git push origin main
```

## 6. Ready for Deployment!

Once you've run all above, you're ready to:
- Deploy frontend on Vercel
- Deploy backend on Render.com
- Configure environment variables on each platform

See `DEPLOYMENT_GUIDE.md` for detailed step-by-step instructions.
