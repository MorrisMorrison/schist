#!/bin/bash

# Start e2e servers script for Playwright
set -e

echo "Starting Docker services..."
docker-compose --profile e2e up --build -d

echo "Waiting for services to be ready..."
timeout=180 # Increased for Docker builds in CI
counter=0

while [ $counter -lt $timeout ]; do
    # Check if both services are ready
    auth_disabled_ready=false
    auth_enabled_ready=false
    
    if curl -f -s http://localhost:8081/api/health > /dev/null 2>&1; then
        auth_disabled_ready=true
    fi
    
    if curl -f -s http://localhost:8082/api/health > /dev/null 2>&1; then
        auth_enabled_ready=true
    fi
    
    if [ "$auth_disabled_ready" = true ] && [ "$auth_enabled_ready" = true ]; then
        echo ""
        echo "✅ Both services are ready!"
        echo "  - Auth disabled: http://localhost:8081"
        echo "  - Auth enabled:  http://localhost:8082"
        echo "READY"
        break
    fi
    
    if [ $counter -eq 0 ]; then
        echo -n "Waiting for services"
    else
        echo -n "."
    fi
    
    sleep 1
    counter=$((counter + 1))
done

if [ $counter -eq $timeout ]; then
    echo ""
    echo "❌ Services failed to start within ${timeout} seconds"
    echo "Container logs:"
    docker-compose --profile e2e logs
    docker-compose --profile e2e down
    exit 1
fi

# Keep the script running so Playwright can detect the servers
trap 'echo "Shutting down..."; docker-compose --profile e2e down; exit 0' SIGINT SIGTERM

# Keep running until interrupted
while true; do
    sleep 5
    # Simple health check - if we can't reach either service, exit
    if ! curl -f -s http://localhost:8081/api/health > /dev/null 2>&1 || \
       ! curl -f -s http://localhost:8082/api/health > /dev/null 2>&1; then
        echo "❌ One or more services became unavailable"
        docker-compose --profile e2e logs
        docker-compose --profile e2e down
        exit 1
    fi
done