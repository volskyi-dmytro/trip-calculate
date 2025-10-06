function showCalculator() {
    document.getElementById("calculator-modal").style.display = "block";
}

function closeCalculator() {
    document.getElementById("calculator-modal").style.display = "none";
    document.getElementById("calculator-form").reset();
    document.getElementById("result").innerHTML = "";
}

function calculateExpenses(event) {
    event.preventDefault();
    const form = document.getElementById("calculator-form");
    const customFuelConsumption = parseFloat(form.customFuelConsumption.value);
    const numberOfPassengers = parseInt(form.numberOfPassengers.value);
    const distance = parseFloat(form.distance.value);
    const fuelCost = parseFloat(form.fuelCost.value);

    const trip = {
        customFuelConsumption,
        numberOfPassengers,
        distance,
        fuelCost
    };

    fetch('/calculate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(trip)
    })
    .then(response => response.json())
    .then(data => {
        const resultDiv = document.getElementById("result");
        const currentLang = document.documentElement.getAttribute('lang');

        // Determine the labels based on the current language
                const totalFuelCostLabel = currentLang === "uk" ? "Загальна вартість палива" : "Total Fuel Cost";
                const costPerPassengerLabel = currentLang === "uk" ? "Вартість на пасажира" : "Cost Per Passenger";

                // Display the results with translations
                resultDiv.innerHTML = `
                    <p>${totalFuelCostLabel}: ${data.totalFuelCost.toFixed(2)}</p>
                    <p>${costPerPassengerLabel}: ${data.costPerPassenger.toFixed(2)}</p>
                `;
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

function setLanguage(lang) {
    const elements = document.querySelectorAll('[data-lang-en], [data-lang-uk]');
    elements.forEach(el => {
        if (lang === 'en') {
            el.textContent = el.getAttribute('data-lang-en');
            if (el.hasAttribute('data-title-en')) {
                el.setAttribute('title', el.getAttribute('data-title-en'));
            }
        } else if (lang === 'uk') {
            el.textContent = el.getAttribute('data-lang-uk');
            if (el.hasAttribute('data-title-uk')) {
                el.setAttribute('title', el.getAttribute('data-title-uk'));
            }
        }
    });
}

// Set the initial language when the page loads
setLanguage('uk'); // Or 'en' depending on the default language you want

function getSeason() {
    const month = new Date().getMonth() + 1; // getMonth() is zero-based
    if (month >= 3 && month <= 5) {
        return 'spring';
    } else if (month >= 6 && month <= 8) {
        return 'summer';
    } else if (month >= 9 && month <= 11) {
        return 'autumn';
    } else {
        return 'winter';
    }
}

function setSeasonalBackground() {
    const season = getSeason();
    const header = document.querySelector('.header');
    header.style.backgroundImage = `url('/images/${season}.webp')`;
}

// Set the seasonal background image
setSeasonalBackground();


// Function to toggle between light and dark modes
function toggleMode() {
    const currentTheme = document.body.getAttribute("data-theme");

    if (currentTheme === "dark") {
        document.body.setAttribute("data-theme", "light");
        localStorage.setItem("theme", "light");
    } else {
        document.body.setAttribute("data-theme", "dark");
        localStorage.setItem("theme", "dark");
    }
}

// Function to load the saved theme from localStorage
function loadSavedTheme() {
    const savedTheme = localStorage.getItem("theme") || "light";
    document.body.setAttribute("data-theme", savedTheme);

    if (savedTheme === "dark") {
        document.getElementById("darkmode-toggle").checked = true;
    }
}

// Event listener for the toggle switch
document.getElementById('darkmode-toggle').addEventListener('change', toggleMode);

document.getElementById("calculator-form").addEventListener("reset", function() {
    document.getElementById("result").innerHTML = ""; // Clear the result fields
});

// Load the saved theme when the page loads
window.addEventListener('load', loadSavedTheme);

// ============================================
// Authentication Functions
// ============================================

/**
 * Check authentication status and update UI accordingly
 */
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/user/me');
        const data = await response.json();

        if (data.authenticated) {
            // User is authenticated
            showUserProfile(data);
            enableCreateTripButton();
        } else {
            // User is not authenticated
            showLoginButton();
            disableCreateTripButton();
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        showLoginButton();
        disableCreateTripButton();
    }
}

/**
 * Display user profile information
 */
function showUserProfile(userData) {
    const loginSection = document.getElementById('login-section');
    const userProfile = document.getElementById('user-profile');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');

    // Hide login button
    loginSection.style.display = 'none';

    // Show user profile
    userProfile.style.display = 'flex';

    // Set avatar through proxy to avoid CORS and rate limiting
    if (userData.picture) {
        userAvatar.src = '/api/avatar/proxy?url=' + encodeURIComponent(userData.picture);
    } else {
        userAvatar.src = '/images/default-avatar.png';
    }

    userName.textContent = userData.name || userData.email;
}

/**
 * Perform logout - clear session and force re-authentication on next login
 */
async function performLogout() {
    try {
        // Get CSRF token
        const csrfResponse = await fetch('/api/user/csrf');
        const csrfData = await csrfResponse.json();
        const csrfToken = csrfData.token;

        if (!csrfToken) {
            console.error('No CSRF token available');
            // Redirect anyway to clear frontend state
            window.location.href = '/';
            return;
        }

        // Create form data with CSRF token
        const formData = new FormData();
        formData.append('_csrf', csrfToken);

        // Call logout endpoint - backend handles OAuth revocation and redirects to homepage
        await fetch('/logout', {
            method: 'POST',
            body: formData,
            redirect: 'follow'
        });

        // Backend will redirect to homepage after successful logout
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
        // Fallback: redirect to homepage
        window.location.href = '/';
    }
}

/**
 * Display login button
 */
function showLoginButton() {
    const loginSection = document.getElementById('login-section');
    const userProfile = document.getElementById('user-profile');

    // Show login button
    loginSection.style.display = 'block';

    // Hide user profile
    userProfile.style.display = 'none';
}

/**
 * Enable "Create a trip" button for authenticated users
 */
function enableCreateTripButton() {
    const createTripBtn = document.getElementById('create-trip-btn');
    const currentLang = document.documentElement.getAttribute('lang') || 'en';

    createTripBtn.classList.remove('inactive');
    createTripBtn.removeAttribute('title');
    createTripBtn.style.cursor = 'pointer';

    // Add click handler (placeholder for now)
    createTripBtn.onclick = function() {
        alert(currentLang === 'uk' ? 'Функція в розробці!' : 'Feature coming soon!');
    };
}

/**
 * Disable "Create a trip" button for guests
 */
function disableCreateTripButton() {
    const createTripBtn = document.getElementById('create-trip-btn');
    const currentLang = document.documentElement.getAttribute('lang') || 'en';

    createTripBtn.classList.add('inactive');
    createTripBtn.style.cursor = 'not-allowed';

    const title = currentLang === 'uk' ? 'Потрібен вхід' : 'Login required';
    createTripBtn.setAttribute('title', title);

    // Remove click handler
    createTripBtn.onclick = null;
}

/**
 * Check for error messages in URL parameters
 */
function checkForErrors() {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');

    if (error) {
        const errorMessages = {
            'auth_failed': {
                'en': 'Authentication failed. Please try again.',
                'uk': 'Помилка автентифікації. Будь ласка, спробуйте ще раз.'
            }
        };

        const currentLang = document.documentElement.getAttribute('lang') || 'en';
        const message = errorMessages[error] ? errorMessages[error][currentLang] :
                       (currentLang === 'uk' ? 'Виникла помилка' : 'An error occurred');

        showErrorMessage(message);

        // Clear error from URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

/**
 * Display error message to user
 */
function showErrorMessage(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Initialize authentication on page load
window.addEventListener('load', function() {
    checkAuthStatus();
    checkForErrors();
});



