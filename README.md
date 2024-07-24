# Trip Calculate

Trip Calculate is a web service for planning and splitting trip expenses. It allows users to calculate fuel costs based on custom fuel consumption, number of passengers, distance, and fuel cost.

## Features

- Responsive design
- Multilingual support (English and Ukrainian)
- Seasonal background images
- Secure connection with SSL
- Dockerized for easy deployment

## Getting Started

### Prerequisites

- Docker
- Java 17
- Spring Boot

### Running Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/trip-calculate.git

2. Build and run the Docker container:

   ```bash
   cd trip-calculate
   docker build -t trip-calculate .
   docker run -d -p 8080:8080 --name trip-calculate-container trip-calculate
