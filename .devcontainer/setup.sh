#!/bin/bash

set -e

if [ ! $(which claude) ]; then
    # hardcoding version for the minute due to bug https://github.com/anthropics/claude-code/issues/47669
    /workspaces/bonob/.devcontainer/claude-install.sh 2.1.89
fi