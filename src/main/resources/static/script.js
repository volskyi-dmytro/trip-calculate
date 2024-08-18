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



