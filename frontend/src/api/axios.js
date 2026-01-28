import axios from 'axios';

// Session Duration: 4 Hours (in milliseconds)
const SESSION_DURATION = 4 * 60 * 60 * 1000;

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api',
    timeout: 10000, 
    headers: {
        'Content-Type': 'application/json'
    }
});

/**
 * REQUEST INTERCEPTOR
 * Checks for client-side session expiry before the request even leaves.
 */
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        const loginTime = localStorage.getItem('loginTime');

        // 1. Client-side Session Expiry Check (Absolute 4-hour window)
        if (token && loginTime) {
            const now = Date.now();
            if (now - parseInt(loginTime) > SESSION_DURATION) {
                console.warn("Session exceeded 4 hours limit. Logging out.");
                handleLogout('expired');
                
                // Cancel the request to prevent unnecessary server load
                const controller = new AbortController();
                config.signal = controller.signal;
                controller.abort(); 
                return config;
            }
        }

        // 2. Attach Token if available
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

/**
 * RESPONSE INTERCEPTOR
 * Handles errors returned by the server (Expired tokens, Invalid tokens, Server errors).
 */
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const originalRequest = error.config;
        
        // Skip logout logic if the error happened during the login attempt itself
        if (originalRequest?.url?.includes('/auth/login')) {
            return Promise.reject(error);
        }

        if (error.response) {
            const status = error.response.status;

            // 1. Handle Invalid or Expired Token (401 or 403)
            // 401: Unauthorized (Token expired/Invalid)
            // 403: Forbidden (Token tampered with or insufficient permissions)
            if (status === 401 || status === 403) {
                console.error("Authentication failed. Invalid or Expired Token.");
                handleLogout('invalid');
            }
            
            // 2. Server Side Errors
            else if (status === 500) {
                console.error("Server Error (500). Please check backend logs.");
            }
        } else if (error.request) {
            // 3. Network Error (No response received)
            console.error("Network Error: Server is unreachable or offline.");
        }

        return Promise.reject(error);
    }
);

/**
 * Helper function to clear session and redirect to login.
 * @param {string} reason - Provides context to the login page (expired vs invalid).
 */
const handleLogout = (reason = 'true') => {
    // Clear all security-related items from storage
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('loginTime');

    // Redirect to login page with a query parameter so the UI can show a specific Toast message
    // reason 'expired' = Session timed out
    // reason 'invalid' = Security error / Invalid token
    if (!window.location.pathname.includes('/login')) {
        window.location.href = `/login?reason=${reason}`;
    }
};

export default api;