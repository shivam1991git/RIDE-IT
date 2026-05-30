import axios from 'axios';

// ✅ Use environment variable for API URL (changes based on environment)
// Development: http://localhost:5000
// Production: https://render-backend-url.onrender.com
const API_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
axios.defaults.baseURL = API_URL;

function readStoredAccount() {
  const keys = ['admin', 'driver', 'user'];

  for (const key of keys) {
    try {
      const value = localStorage.getItem(key);
      if (!value) {
        continue;
      }

      const account = JSON.parse(value);
      if (account?.token) {
        return account;
      }
    } catch (error) {
      localStorage.removeItem(key);
    }
  }

  return null;
}

axios.interceptors.request.use((config) => {
  const account = readStoredAccount();
  if (account?.token) {
    config.headers.Authorization = `Bearer ${account.token}`;
  }

  return config;
});
