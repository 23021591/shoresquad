// Weather and Map API keys (should be moved to environment variables in production)
const API_KEYS = {
    weather: 'YOUR_WEATHER_API_KEY',
    maps: 'YOUR_MAPS_API_KEY'
};

// Core ShoreSquad application class
class ShoreSquad {
    constructor() {
        this.map = null;
        this.weatherData = null;
        this.cleanupEvents = new Map();
        this.currentLocation = null;
        this.init();
    }

    async init() {
        try {
            await this.initializeGeolocation();
            await Promise.all([
                this.initMap(),
                this.initWeather(),
                this.loadCleanupEvents()
            ]);
            this.setupEventListeners();
            this.setupIntersectionObserver();
        } catch (error) {
            console.error('Initialization error:', error);
            this.handleError(error);
        }
    }

    async initializeGeolocation() {
        try {
            const position = await this.getCurrentPosition();
            this.currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
        } catch (error) {
            console.warn('Geolocation error:', error);
            // Default to a popular beach location
            this.currentLocation = { lat: -33.8688, lng: 151.2093 }; // Sydney Beach
        }
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported'));
                return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });
    }

    setupIntersectionObserver() {
        const options = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, options);

        // Observe sections for progressive loading
        document.querySelectorAll('section').forEach(section => {
            section.classList.add('fade-in');
            observer.observe(section);
        });
    }    async initMap() {
        try {
            const mapContainer = document.getElementById('cleanup-map');
            if (!mapContainer) return;

            // Initialize Google Maps
            this.map = new google.maps.Map(mapContainer, {
                center: this.currentLocation,
                zoom: 12,
                styles: this.getMapStyles(),
                mapTypeControl: false,
                fullscreenControl: true,
                streetViewControl: false
            });

            // Add custom controls
            const locationButton = this.createLocationButton();
            this.map.controls[google.maps.ControlPosition.TOP_RIGHT].push(locationButton);

            // Initialize Places service for location search
            this.placesService = new google.maps.places.PlacesService(this.map);
        } catch (error) {
            console.error('Map initialization error:', error);
            this.handleError(error);
        }
    }

    getMapStyles() {
        // Custom style to emphasize beaches and water features
        return [
            {
                featureType: 'water',
                elementType: 'geometry',
                stylers: [{ color: '#e9e9e9' }, { lightness: 17 }]
            },
            {
                featureType: 'landscape',
                elementType: 'geometry',
                stylers: [{ color: '#f5f5f5' }, { lightness: 20 }]
            },
            {
                featureType: 'poi.park',
                elementType: 'geometry',
                stylers: [{ color: '#dedede' }, { lightness: 21 }]
            },
            {
                featureType: 'water',
                elementType: 'labels.text.stroke',
                stylers: [{ color: '#ffffff' }]
            },
            {
                featureType: 'water',
                elementType: 'labels.text.fill',
                stylers: [{ color: '#3d3d3d' }]
            }
        ];
    }

    createLocationButton() {
        const locationButton = document.createElement('button');
        locationButton.classList.add('custom-map-control');
        locationButton.innerHTML = '<i class="fas fa-location-arrow"></i>';
        locationButton.title = 'Center Map on Your Location';
        
        locationButton.addEventListener('click', () => {
            if (this.currentLocation) {
                this.map.setCenter(this.currentLocation);
                this.map.setZoom(14);
            }
        });

        return locationButton;
    }

    async initWeather() {
        try {
            if (!this.currentLocation) return;
            
            const response = await fetch(
                `https://api.weatherapi.com/v1/forecast.json?key=${API_KEYS.weather}&q=${this.currentLocation.lat},${this.currentLocation.lng}&days=3`
            );
            
            if (!response.ok) throw new Error('Weather API error');
            
            this.weatherData = await response.json();
            this.updateWeatherDisplay();
        } catch (error) {
            console.error('Weather fetch error:', error);
            this.handleError(error);
        }
    }    updateWeatherDisplay() {
        const container = document.getElementById('weather-display');
        if (!container || !this.weatherData) return;

        const forecast = this.weatherData.forecast.forecastday;
        const getDayName = (dateStr) => new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
        const getBeachCondition = (day) => {
            const conditions = day.day.condition.text.toLowerCase();
            const windSpeed = day.day.maxwind_kph;
            const precipitation = day.day.totalprecip_mm;
            
            if (precipitation > 5 || conditions.includes('rain') || conditions.includes('storm')) {
                return { text: 'Not Ideal for Beach Cleanup', class: 'condition-bad' };
            }
            if (windSpeed > 30) {
                return { text: 'Windy - Use Caution', class: 'condition-warning' };
            }
            return { text: 'Good for Beach Cleanup!', class: 'condition-good' };
        };

        container.innerHTML = forecast.map(day => {
            const condition = getBeachCondition(day);
            return `
                <div class="weather-card ${condition.class}">
                    <div class="weather-card-header">
                        <h3>${getDayName(day.date)}</h3>
                        <img src="${day.day.condition.icon}" alt="${day.day.condition.text}" 
                            class="weather-icon" width="64" height="64">
                    </div>
                    <div class="weather-card-body">
                        <p class="temperature">
                            <span class="high">${Math.round(day.day.maxtemp_c)}°</span> / 
                            <span class="low">${Math.round(day.day.mintemp_c)}°</span>
                        </p>
                        <p class="wind">
                            <i class="fas fa-wind"></i> ${Math.round(day.day.maxwind_kph)} km/h
                        </p>
                        <p class="precipitation">
                            <i class="fas fa-tint"></i> ${day.day.totalprecip_mm}mm
                        </p>
                        <p class="beach-condition">
                            <i class="fas fa-umbrella-beach"></i> ${condition.text}
                        </p>
                    </div>
                </div>
            `;
        }).join('');
    }

    async loadCleanupEvents() {
        try {
            // Fetch cleanup events from backend (replace with actual API endpoint)
            const response = await fetch('/api/events');
            const events = await response.json();
            
            events.forEach(event => {
                this.cleanupEvents.set(event.id, event);
                this.addEventToMap(event);
            });
            
            this.updateEventsList();
        } catch (error) {
            console.error('Events loading error:', error);
            this.handleError(error);
        }
    }

    addEventToMap(event) {
        if (!this.map) return;
        // Add event marker to map (implementation depends on map service)
        const marker = new Marker({
            position: event.location,
            map: this.map,
            title: event.title
        });

        marker.addListener('click', () => this.showEventDetails(event));
    }

    updateEventsList() {
        const container = document.getElementById('events-list');
        if (!container) return;

        const eventElements = Array.from(this.cleanupEvents.values()).map(event => `
            <div class="event-card">
                <h3>${event.title}</h3>
                <p>${event.date}</p>
                <p>${event.description}</p>
                <button onclick="app.joinEvent('${event.id}')" class="cta-button">Join Cleanup</button>
            </div>
        `);

        container.innerHTML = eventElements.join('');
    }

    async joinEvent(eventId) {
        try {
            // Implementation for joining an event
            const event = this.cleanupEvents.get(eventId);
            if (!event) throw new Error('Event not found');

            // API call to join event (replace with actual endpoint)
            await fetch(`/api/events/${eventId}/join`, { method: 'POST' });
            
            // Update UI to reflect joined status
            this.updateEventsList();
        } catch (error) {
            console.error('Join event error:', error);
            this.handleError(error);
        }
    }

    setupEventListeners() {
        // Add event listeners for user interactions
        document.querySelector('.cta-button.primary')?.addEventListener('click', () => {
            this.map?.setCenter(this.currentLocation);
        });
    }

    handleError(error) {
        // Show user-friendly error message
        const errorContainer = document.createElement('div');
        errorContainer.classList.add('error-toast');
        errorContainer.textContent = 'Something went wrong. Please try again later.';
        document.body.appendChild(errorContainer);

        // Remove error message after 5 seconds
        setTimeout(() => errorContainer.remove(), 5000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new ShoreSquad();
    // Make app instance globally available for event handlers
    window.app = app;
});

// Export modules for testing
export { ShoreSquad };
