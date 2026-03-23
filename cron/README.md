# Nightly Process Cleanup

This directory contains the cron job setup for nightly cleanup of old processes.

## Overview

The cleanup process runs daily at midnight and:
1. Finds processes not accessed in the last 30 days
2. Marks them for deletion (`setToDelete = true`)
3. Calls the Python API to delete ngrams (`/delete/{process_id}`)
4. Upon successful Python deletion, removes the process and related data from the database

## Files

- `cleanup.sh` - Shell script to run the cleanup (executable)

## Setup Instructions

### 1. Test the cleanup script manually first

```bash
cd /Users/taleh/Desktop/thesis/prost
npm run cleanup
```

### 2. Add to crontab for daily execution

Open crontab:
```bash
crontab -e
```

Add this line to run at midnight daily:
```
0 0 * * * /Users/taleh/Desktop/thesis/prost/cron/cleanup.sh
```

### 3. Verify cron is working

Check cron logs:
```bash
grep CRON /var/log/syslog
```

Or check if the job is scheduled:
```bash
crontab -l
```

## Manual Execution

You can also run the cleanup manually anytime:

```bash
# From project root
npm run cleanup

# Or directly
npx ts-node db/scripts/cleanupProcesses.ts
```

## What Gets Cleaned Up

- **Processes**: Records in the `process` table older than 30 days
- **Events**: All related events in the `event` table
- **Frames**: All related frames in the `frame` table
- **Python Ngrams**: Calls `/delete/{process_id}` on the Python service

## Safety Features

- Processes are marked for deletion first (`setToDelete = true`)
- API access is blocked for marked processes (returns 410 Gone)
- Only processes successfully deleted from Python are removed from database
- Failed Python deletions are retried on next run

## Monitoring

The script logs all operations. Check the output for:
- Number of processes found and marked for deletion
- Success/failure of Python API calls
- Database cleanup operations
