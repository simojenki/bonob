#!/bin/bash

set -e

if [ ! $(which claude) ] && [ "${BNB_DEV_USE_CLAUDE}" == "true" ]; then
    # hardcoding version for the minute due to bug https://github.com/anthropics/claude-code/issues/47669
    /workspaces/bonob/.devcontainer/claude-install.sh 2.1.89
fi