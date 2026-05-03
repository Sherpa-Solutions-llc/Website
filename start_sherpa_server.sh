#!/bin/bash

echo "Starting Sherpa server setup..."

# Check if python3-venv is installed, install if missing
if ! dpkg -l | grep -q python3-venv; then
    echo "Python3-venv is missing. We need sudo access to install it."
    sudo apt-get update
    sudo apt-get install -y python3-pip python3.12-venv
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install requirements
echo "Installing requirements..."
pip install -r requirements.txt

# Start the server
echo "Starting Uvicorn server..."
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
