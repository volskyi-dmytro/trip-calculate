#!/bin/bash

set -e  # Exit on error

# Change to script directory
cd "$(dirname "$0")"

echo "🚀 Trip Calculate - Local Build and Deploy Script"
echo "=================================================="
echo "Working directory: $(pwd)"

# Step 1: Clean previous builds
echo ""
echo "📦 Step 1: Cleaning previous builds..."
rm -rf frontend/dist
rm -rf src/main/resources/static/*
echo "✅ Clean complete"

# Step 2: Build React frontend
echo ""
echo "🔨 Step 2: Building React frontend..."
cd frontend
npm run build
cd ..
echo "✅ Frontend build complete"

# Step 3: Verify frontend build
echo ""
echo "🔍 Step 3: Verifying frontend build..."
if [ ! -f "frontend/dist/index.html" ]; then
    echo "❌ ERROR: frontend/dist/index.html not found!"
    exit 1
fi

FRONTEND_BUNDLE=$(grep -o "index-[^.]*\.js" frontend/dist/index.html | head -1)
echo "📦 Frontend bundle: $FRONTEND_BUNDLE"

if [ ! -f "frontend/dist/assets/$FRONTEND_BUNDLE" ]; then
    echo "❌ ERROR: Bundle file $FRONTEND_BUNDLE not found in frontend/dist/assets/!"
    exit 1
fi
echo "✅ Frontend build verified"

# Step 4: Copy to Spring Boot static resources
echo ""
echo "📂 Step 4: Copying frontend to Spring Boot static resources..."
mkdir -p src/main/resources/static
cp -r frontend/dist/* src/main/resources/static/
echo "✅ Copy complete"

# Step 5: Verify static resources
echo ""
echo "🔍 Step 5: Verifying static resources..."
if [ ! -f "src/main/resources/static/index.html" ]; then
    echo "❌ ERROR: index.html not copied to static resources!"
    exit 1
fi

STATIC_BUNDLE=$(grep -o "index-[^.]*\.js" src/main/resources/static/index.html | head -1)
echo "📦 Static bundle: $STATIC_BUNDLE"

if [ ! -f "src/main/resources/static/assets/$STATIC_BUNDLE" ]; then
    echo "❌ ERROR: Bundle file $STATIC_BUNDLE not found in static/assets/!"
    exit 1
fi

# Check if frontend and static bundles match
if [ "$FRONTEND_BUNDLE" != "$STATIC_BUNDLE" ]; then
    echo "⚠️  WARNING: Frontend bundle ($FRONTEND_BUNDLE) doesn't match static bundle ($STATIC_BUNDLE)!"
    echo "This may indicate an issue with the copy process."
    exit 1
fi

# Check for stale bundles
BUNDLE_COUNT=$(find src/main/resources/static/assets -name "index-*.js" -type f | wc -l)
echo "📊 Total index bundles found: $BUNDLE_COUNT"
if [ "$BUNDLE_COUNT" -ne 1 ]; then
    echo "⚠️  WARNING: Multiple index bundles found! This may indicate stale files."
    find src/main/resources/static/assets -name "index-*.js" -type f
fi

echo "✅ Static resources verified"

# Step 6: Build Spring Boot JAR
echo ""
echo "🔨 Step 6: Building Spring Boot JAR..."
mvn clean package -DskipTests
echo "✅ JAR build complete"

# Step 7: Verify JAR contents
echo ""
echo "🔍 Step 7: Verifying JAR contents..."
jar tf target/*.jar | grep "BOOT-INF/classes/static/index.html" > /dev/null || {
    echo "❌ ERROR: index.html not found in JAR!"
    exit 1
}

# Extract and verify bundle reference in JAR
jar xf target/*.jar BOOT-INF/classes/static/index.html
BUNDLE_IN_JAR=$(grep -o "index-[^.]*\.js" BOOT-INF/classes/static/index.html | head -1)
echo "📦 Bundle in JAR: $BUNDLE_IN_JAR"

jar tf target/*.jar | grep "BOOT-INF/classes/static/assets/$BUNDLE_IN_JAR" > /dev/null || {
    echo "❌ ERROR: Bundle file $BUNDLE_IN_JAR not found in JAR!"
    rm -rf BOOT-INF
    exit 1
}
rm -rf BOOT-INF

# Verify all three bundle references match
if [ "$FRONTEND_BUNDLE" != "$BUNDLE_IN_JAR" ]; then
    echo "❌ ERROR: Bundle mismatch!"
    echo "  Frontend: $FRONTEND_BUNDLE"
    echo "  Static:   $STATIC_BUNDLE"
    echo "  JAR:      $BUNDLE_IN_JAR"
    exit 1
fi

echo "✅ JAR contents verified"

# Step 8: Summary
echo ""
echo "🎉 Build Complete!"
echo "=================="
echo "✅ Bundle hash: $BUNDLE_IN_JAR"
echo "✅ JAR location: $(ls -1 target/*.jar)"
echo "✅ JAR size: $(ls -lh target/*.jar | awk '{print $5}')"
echo ""
echo "To run locally:"
echo "  java -jar target/*.jar"
echo ""
echo "To deploy:"
echo "  git add ."
echo "  git commit -m \"build: Update frontend bundle\""
echo "  git push origin master"
