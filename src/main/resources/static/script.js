function showCalculator() {
    document.getElementById("calculator-modal").style.display = "block";
}

function closeCalculator() {
    document.getElementById("calculator-modal").style.display = "none";
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
        resultDiv.innerHTML = `
            <p>Total Fuel Cost: ${data.totalFuelCost.toFixed(2)}</p>
            <p>Cost Per Passenger: ${data.costPerPassenger.toFixed(2)}</p>
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
        } else if (lang === 'uk') {
            el.textContent = el.getAttribute('data-lang-uk');
        }
    });
}

// Set default language to Ukrainian
setLanguage('uk');

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


