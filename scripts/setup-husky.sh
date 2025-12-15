#!/bin/bash
# Setup husky for git hooks

if [ -d ".git" ]; then
    npx husky init 2>/dev/null || true
    echo "npx lint-staged" > .husky/pre-commit
    echo "✅ Husky configured"
else
    echo "⏭️  Not a git repo, skipping husky setup"
fi
