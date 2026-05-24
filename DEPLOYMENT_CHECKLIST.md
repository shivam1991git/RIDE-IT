# DEPLOYMENT CHECKLIST - RIDE-IT PROJECT

Print this out and check off items as you complete them!

---

## PHASE 1: LOCAL SETUP & PREPARATION

### Project Structure & Security
- [ ] Verified `.env` file is in `.gitignore`
- [ ] Verified `node_modules/` is in `.gitignore`
- [ ] Verified `.build/` is in `.gitignore`
- [ ] No hardcoded API keys in source code
- [ ] No hardcoded MongoDB credentials in source code
- [ ] No hardcoded Stripe keys in source code
- [ ] `.env.example` has placeholder values (no real secrets)
- [ ] `client/.env.example` created with placeholders

### Code Updates for Production
- [ ] Updated `server.js` with CORS configuration
- [ ] Updated `server.js` with graceful shutdown
- [ ] Updated `client/src/api/axiosConfig.js` to use `process.env.REACT_APP_API_URL`
- [ ] Added `cors` package to `package.json` (`npm install cors`)
- [ ] Tested locally: `npm install && npm start` in root
- [ ] Tested locally: `cd client && npm install && npm start`

### Environment Variables Setup
- [ ] Created `.env` file in root with all required variables:
  - [ ] `PORT=5000`
  - [ ] `MONGO_URI=mongodb+srv://...`
  - [ ] `MONGO_DB_NAME=ride-it`
  - [ ] `JWT_SECRET=` (long random string, min 32 chars)
  - [ ] `STRIPE_SECRET_KEY=sk_test_...`

- [ ] Created `.env.local` in `client/` with variables:
  - [ ] `REACT_APP_API_URL=http://localhost:5000`
  - [ ] `REACT_APP_STRIPE_PUBLIC_KEY=pk_test_...`

### MongoDB Atlas Preparation
- [ ] Logged into MongoDB Atlas dashboard
- [ ] Verified connection string is correct
- [ ] Added IP `0.0.0.0/0` to Network Access (for cloud deployment)
- [ ] Created production-grade password (used in MONGO_URI)
- [ ] Tested connection string locally (worked without errors)

### Testing Before Deployment
- [ ] Ran `npm install` successfully
- [ ] Backend starts without errors: `npm start`
- [ ] Frontend starts without errors: `cd client && npm start`
- [ ] Can register new user locally
- [ ] Can login with credentials
- [ ] Can access API endpoints
- [ ] No console errors in browser DevTools
- [ ] Data persists in MongoDB Atlas

---

## PHASE 2: GIT & GITHUB

### Git Configuration
- [ ] Verified git is initialized: `git status`
- [ ] Verified remote is set: `git remote -v`
- [ ] If not, added remote: `git remote add origin https://github.com/YOUR_USERNAME/RIDE-IT-WEB-APP.git`

### GitHub Repository
- [ ] Created new repository on GitHub.com
  - [ ] Repository name: RIDE-IT-WEB-APP (or similar)
  - [ ] Made it PUBLIC (for recruiters to see)
  - [ ] Did NOT initialize with README (we have one)
  
- [ ] Updated remote URL if needed:
  ```
  git remote set-url origin https://github.com/YOUR_USERNAME/RIDE-IT-WEB-APP.git
  ```

### Push to GitHub
- [ ] Staged all changes: `git add .`
- [ ] Verified staging: `git status` (should NOT show .env)
- [ ] Committed with message: `git commit -m "Production-ready MERN app"`
- [ ] Pushed to GitHub: `git push -u origin main`
- [ ] Repository now visible on GitHub.com ✓

### Verify GitHub Status
- [ ] Visited https://github.com/YOUR_USERNAME/RIDE-IT-WEB-APP
- [ ] Code visible on GitHub
- [ ] No `.env` file exposed (only `.env.example`)
- [ ] Beautiful README visible

---

## PHASE 3: FRONTEND DEPLOYMENT (VERCEL)

### Vercel Account
- [ ] Created account at vercel.com (via GitHub)
- [ ] Authorized Vercel to access GitHub repos

### Import Project to Vercel
- [ ] Clicked "Import Project" on Vercel dashboard
- [ ] Selected RIDE-IT-WEB-APP repository
- [ ] Vercel detected it as React app

### Configure Build Settings
- [ ] Set Root Directory: `client/` (CRITICAL!)
- [ ] Build Command: `npm run build` ✓
- [ ] Output Directory: `build` ✓
- [ ] Install Command: `npm install` ✓

### Environment Variables (Frontend)
- [ ] Added environment variables in Vercel settings:
  - [ ] `REACT_APP_API_URL` = (leave empty for now - will update later)
  - [ ] `REACT_APP_STRIPE_PUBLIC_KEY` = pk_test_...

### Deploy
- [ ] Clicked "Deploy" button
- [ ] Waited for build to complete (2-5 minutes)
- [ ] Deployment successful ✓
- [ ] Got Vercel URL: https://ride-it-web-app-xyz.vercel.app

### Verify Frontend Deployment
- [ ] Opened Vercel URL in browser
- [ ] Homepage loads ✓
- [ ] Navigation works ✓
- [ ] No 404 errors ✓
- [ ] (API errors expected - backend not deployed yet)

### Note: Save Vercel URL
```
Frontend URL: https://YOUR_VERCEL_URL.vercel.app

You'll need this for:
1. CORS configuration in backend
2. Resume/portfolio
3. Testing
```

---

## PHASE 4: BACKEND DEPLOYMENT (RENDER.COM)

### Render Account
- [ ] Created account at render.com (via GitHub)
- [ ] Authorized Render to access GitHub repos

### Create Web Service on Render
- [ ] Clicked "New Web Service"
- [ ] Selected RIDE-IT-WEB-APP repository
- [ ] Connected successfully

### Configure Service Settings
- [ ] Name: `ride-it-backend` (or similar)
- [ ] Environment: `Node`
- [ ] Region: (closest to you)
- [ ] Branch: `main`
- [ ] Build Command: `npm install`
- [ ] Start Command: `node server.js`
- [ ] Root Directory: `.` (or leave blank)

### Environment Variables (Backend)
- [ ] Added all environment variables in Render:
  - [ ] `PORT` = 5000
  - [ ] `MONGO_URI` = mongodb+srv://shivam-singh:PASSWORD@cluster0.25rsjmw.mongodb.net/ride-it
  - [ ] `MONGO_DB_NAME` = ride-it
  - [ ] `JWT_SECRET` = (same as local, or new strong random)
  - [ ] `STRIPE_SECRET_KEY` = sk_test_...
  - [ ] `FRONTEND_URL` = https://YOUR_VERCEL_URL.vercel.app (from Phase 3)

### Deploy
- [ ] Clicked "Create Web Service"
- [ ] Waited for deployment (2-5 minutes)
- [ ] Status shows "Live" ✓
- [ ] Got Render URL: https://ride-it-backend.onrender.com

### Verify Backend Deployment
- [ ] Opened https://ride-it-backend.onrender.com in browser
- [ ] Saw "Hello World!" message ✓
- [ ] Checked API: https://ride-it-backend.onrender.com/api/cars
- [ ] Got JSON response ✓
- [ ] Checked Render logs - no errors

### Note: Save Render URL
```
Backend URL: https://YOUR_RENDER_URL.onrender.com

You'll need this for:
1. Frontend environment variable update
2. API calls testing
3. Resume/portfolio
```

---

## PHASE 5: CONNECT FRONTEND TO BACKEND

### Update Frontend API URL
- [ ] Went to Vercel Dashboard → Project Settings
- [ ] Found Environment Variables section
- [ ] Updated `REACT_APP_API_URL`:
  ```
  REACT_APP_API_URL = https://YOUR_RENDER_URL.onrender.com
  ```
- [ ] Saved changes

### Trigger Redeployment
- [ ] Vercel automatically redeployed with new env vars
- [ ] Waited 2-5 minutes for new deployment
- [ ] Deployment status shows "Ready" ✓

### Verify Frontend-Backend Connection
- [ ] Opened your Vercel URL
- [ ] Homepage loads (no CORS error) ✓
- [ ] Opened browser DevTools (F12)
- [ ] Went to Network tab
- [ ] Refreshed page
- [ ] API calls show backend URL (Render domain) ✓
- [ ] API responses status 200 ✓

---

## PHASE 6: PRODUCTION TESTING

### Test Registration
- [ ] Went to frontend (Vercel URL)
- [ ] Clicked Register
- [ ] Filled in form (new test email)
- [ ] Submitted
- [ ] Got success message ✓
- [ ] Redirected to login page ✓
- [ ] Checked MongoDB Atlas → user created ✓

### Test Login
- [ ] Went to Login page
- [ ] Used registered credentials
- [ ] Clicked Login
- [ ] Successfully logged in ✓
- [ ] Redirected to dashboard ✓
- [ ] Token visible in localStorage ✓

### Test Main Features
- [ ] Browsed cars/products ✓
- [ ] Made a booking/transaction ✓
- [ ] Viewed user profile ✓
- [ ] Tested role-based access (user vs driver vs admin) ✓

### Test API Calls (DevTools)
- [ ] Opened DevTools (F12)
- [ ] Network tab
- [ ] Made any API call
- [ ] Request URL shows Render backend ✓
- [ ] Response status 200 ✓
- [ ] Response has correct JSON data ✓

### Test CORS
- [ ] No "CORS error" in console ✓
- [ ] If error: Updated server.js allowedOrigins with Vercel URL
- [ ] Pushed to GitHub
- [ ] Render auto-redeployed
- [ ] Tested again ✓

### Database Verification
- [ ] Logged into MongoDB Atlas
- [ ] Viewed Collections
- [ ] Saw user data being created ✓
- [ ] Saw booking data ✓
- [ ] Data persists after refresh ✓

---

## PHASE 7: PRODUCTION HARDENING

### Update GitHub Repository
- [ ] Updated README.md with deployment info
  - [ ] Added "Live Demo" link (Vercel URL)
  - [ ] Added "GitHub" link
  - [ ] Added tech stack
  - [ ] Added features list

### Secure Environment Variables
- [ ] Verified .env is NOT in GitHub (check .gitignore)
- [ ] Verified credentials changed before going public
- [ ] Verified JWT_SECRET is strong (32+ chars)
- [ ] Verified MongoDB password is strong

### Repository Visibility
- [ ] Made GitHub repo PUBLIC (for recruiters)
  - [ ] GitHub → Repo → Settings → Change Visibility → Public
  - [ ] Confirmed public access

### Add to Portfolio
- [ ] Added project to portfolio website
  - [ ] Included Vercel URL
  - [ ] Included GitHub repo link
  - [ ] Added tech stack
  - [ ] Added brief description
  - [ ] Added key features

### Add to Resume
- [ ] Added deployed project to resume
- [ ] Included live demo link
- [ ] Included GitHub link
- [ ] Mentioned tech stack
- [ ] Mentioned key features

---

## PHASE 8: CI/CD VERIFICATION

### Auto-Deployment Test
- [ ] Made a small change locally (e.g., typo fix)
- [ ] Committed: `git commit -m "Test auto-deployment"`
- [ ] Pushed: `git push origin main`
- [ ] Vercel started auto-deploying ✓
- [ ] Render started auto-deploying ✓
- [ ] Both finished in 2-5 minutes ✓
- [ ] Changes visible on live sites ✓

### Git Workflow Verification
- [ ] Can make changes anytime
- [ ] Simply: `git push origin main`
- [ ] Both services auto-update
- [ ] No manual deployment needed ✓

---

## PHASE 9: FINAL VERIFICATION & LAUNCH

### Complete Testing Checklist
- [ ] Frontend loads on all pages ✓
- [ ] Backend API responds to all requests ✓
- [ ] Database operations work ✓
- [ ] Authentication works (login/register) ✓
- [ ] Payment processing works ✓
- [ ] No console errors ✓
- [ ] No DevTools errors ✓
- [ ] Mobile responsive (check on phone) ✓

### Pre-Launch Security Check
- [ ] No API keys exposed on GitHub ✓
- [ ] .env file not in GitHub ✓
- [ ] CORS properly configured ✓
- [ ] Passwords changed from development ✓
- [ ] JWT_SECRET is strong ✓

### Go Live!
- [ ] Share Vercel URL with friends to test ✓
- [ ] Share portfolio link with recruiters ✓
- [ ] Share GitHub repo link in portfolio ✓
- [ ] Update LinkedIn with project ✓

---

## TROUBLESHOOTING REFERENCE

If something doesn't work:

| Problem | Solution |
|---------|----------|
| API returns 404 | Check backend is running, API URL is correct |
| CORS error | Update server.js allowedOrigins with Vercel URL, push, wait |
| Database won't connect | Check MONGO_URI in Render, verify IP whitelist |
| Frontend stuck on old version | Click "Redeploy" on Vercel, or push new commit |
| Backend won't start | Check Render logs, verify all env vars are set |
| Login doesn't work | Check JWT_SECRET is same in local & production |

---

## QUICK LINKS

- **Vercel Dashboard:** https://vercel.com/dashboard
- **Render Dashboard:** https://dashboard.render.com
- **MongoDB Atlas:** https://www.mongodb.com/cloud/atlas
- **GitHub Repo:** https://github.com/YOUR_USERNAME/RIDE-IT-WEB-APP

---

## NOTES

Use this space to track any issues or customizations:

```
1. ___________________________________________________________________________

2. ___________________________________________________________________________

3. ___________________________________________________________________________

4. ___________________________________________________________________________

5. ___________________________________________________________________________
```

---

**Congratulations! Your project is deployed and ready for recruitment! 🎉**

Share your portfolio link with everyone!
