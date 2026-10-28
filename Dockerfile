# Use Amazon Corretto JDK
FROM amazoncorretto:17-alpine

# Java2D needs native font discovery even when the application loads its own TTF.
RUN apk add --no-cache fontconfig
COPY src/main/resources/receipt-og/Manrope.ttf /usr/share/fonts/trip-calculate/Manrope.ttf
COPY src/main/resources/receipt-og/OFL.txt /usr/share/fonts/trip-calculate/OFL.txt
RUN fc-cache -f
ENV XDG_CACHE_HOME=/tmp/.cache

# Create non-root user for security
RUN addgroup -S spring && adduser -S spring -G spring

# Set working directory
WORKDIR /app

# Copy JAR file (explicitly use the repackaged JAR, not .original)
ARG JAR_FILE=target/TripPlanner-v2.1.jar
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

# Marks a deployed container: DeployedProfileGuard then refuses to start
# unless SPRING_PROFILES_ACTIVE is exactly prod or staging
ENV APP_DEPLOYED=true

# Commit shown by GET /api/build-info; the image build passes --build-arg GIT_SHA=<sha>
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

# Set JVM options optimized for containers
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0 -XX:+UseContainerSupport -Djava.security.egd=file:/dev/./urandom -Djava.awt.headless=true"

# Run application with JVM options
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar trip-calculate.jar"]
