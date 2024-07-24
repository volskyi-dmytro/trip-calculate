# Use the official OpenJDK 17 base image
FROM openjdk:17-jdk-slim

# Add a volume pointing to /tmp
VOLUME /tmp

# Make port 8080 available to the world outside this container
EXPOSE 8080

# The application's jar file
ARG JAR_FILE=target/*.jar

# Add the application's jar to the container
COPY ${JAR_FILE} trip-calculate.jar

# Run the jar file
ENTRYPOINT ["java","-jar","/trip-calculate.jar"]
