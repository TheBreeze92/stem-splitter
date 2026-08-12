#!/bin/bash
# Double-click this file (or run ./stop.command) to stop Stem Splitter's local servers.
lsof -ti:8000 2>/dev/null | xargs kill 2>/dev/null
lsof -ti:3000 2>/dev/null | xargs kill 2>/dev/null
echo "Stem Splitter stopped."
