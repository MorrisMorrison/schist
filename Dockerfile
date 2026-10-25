# Multi-stage Docker build for Schist
# Stage 1: Build frontend
FROM node:26-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build static files with environment variable
ARG PUBLIC_API_URL
ENV PUBLIC_API_URL=$PUBLIC_API_URL
RUN npm run build

# Stage 2: Build backend
FROM golang:1.26-alpine AS backend-builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy backend source
COPY backend/ ./

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -o schist ./cmd/schist

# Stage 3: Production image
FROM alpine:latest

# Links the published ghcr.io package to this repository.
LABEL org.opencontainers.image.source="https://github.com/MorrisMorrison/schist"
LABEL org.opencontainers.image.description="Schist: a lightweight, self-hosted markdown wiki"
LABEL org.opencontainers.image.licenses="MIT"

# Install ca-certificates for HTTPS and curl for health checks
RUN apk --no-cache add ca-certificates curl

WORKDIR /app

# Copy binary from builder
COPY --from=backend-builder /app/schist ./

# Copy frontend build from builder
COPY --from=frontend-builder /app/frontend/build ./web/

# Copy templates from project root
COPY templates/ ./templates/

# Set environment variable for templates directory
ENV SCHIST_TEMPLATES_DIR=./templates

# Create directories for wiki data
RUN mkdir -p /app/data/documents /app/data/assets

# Expose port
EXPOSE 8080

# Run the binary
CMD ["./schist"]