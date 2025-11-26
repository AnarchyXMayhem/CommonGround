#!/bin/bash

# Setup script for CommonGround development environment

set -e

echo "📦 Setting up CommonGround development environment..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  echo "Creating .env file..."
  cp .env.example .env 2>/dev/null || echo "VITE_API_URL=http://localhost:3000" > .env
fi

echo "✅ Setup completed! Run 'npm run dev' to start developing."
