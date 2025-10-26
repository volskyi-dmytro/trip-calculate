# Use Eclipse Temurin JRE (more secure than full JDK)
FROM eclipse-temurin:17-jre-alpine

# Create non-root user for security
RUN addgroup -S spring && adduser -S spring -G spring

# Set working directory
WORKDIR /app

# Copy JAR file
ARG JAR_FILE=target/*.jar
COPY ${JAR_FILE} trip-calculate.jar

# Change ownership to non-root user
RUN chown spring:spring trip-calculate.jar

# Switch to non-root user
USER spring:spring

# Add health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

# Expose port
EXPOSE 8080

# Set JVM options optimized for containers
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0 -XX:+UseContainerSupport -Djava.security.egd=file:/dev/./urandom"

# Run application with JVM options
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar trip-calculate.jar"]
