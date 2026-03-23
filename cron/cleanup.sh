#!/bin/bash

set -euo pipefail

# Nightly Process Cleanup Cron Job
# This script should be added to crontab to run daily at midnight
# Example crontab entry:
# 0 0 * * * /path/to/prost/cron/cleanup.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Load environment variables
source .env

# Run the cleanup script
echo "$(date): Starting nightly process cleanup..."
npm run cleanup

# Log the result
if [ $? -eq 0 ]; then
    echo "$(date): Cleanup completed successfully"
else
    echo "$(date): Cleanup failed with exit code $?"
fi
