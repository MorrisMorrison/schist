#!/bin/bash

# Start e2e servers script for Playwright
set -e

echo "Starting Docker services..."
docker-compose --profile e2e up --build -d

echo "Waiting for services to be ready..."
timeout=60
counter=0

while [ $counter -lt $timeout ]; do
    if curl -f -s http://localhost:8081/api/health > /dev/null && \
       curl -f -s http://localhost:8082/api/health > /dev/null; then
        echo "✅ Both services are ready!"
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
    docker-compose --profile e2e logs
    exit 1
fi

echo ""
echo "🚀 E2E servers are running:"
echo "  - Auth disabled: http://localhost:8081"
echo "  - Auth enabled:  http://localhost:8082"

# Keep the script running so Playwright can detect the servers
trap 'echo "Shutting down..."; docker-compose --profile e2e down; exit 0' SIGINT SIGTERM

# Keep running until interrupted
while true; do
    sleep 5
    # Check if containers are still running
    if ! docker-compose --profile e2e ps -q | xargs docker inspect -f '{{.State.Running}}' | grep -q true; then
        echo "❌ One or more containers stopped unexpectedly"
        docker-compose --profile e2e logs
        exit 1
    fi
done