#!/bin/bash
set -e

VERSION_TYPE=$1

if [ -z "$VERSION_TYPE" ]; then
    echo "Usage: ./scripts/release.sh [patch|minor|major|beta]"
    exit 1
fi

echo "📦 Creating $VERSION_TYPE release..."

# Run version bump
case $VERSION_TYPE in
    patch|minor|major)
        npm version $VERSION_TYPE -m "Release %s"
        ;;
    beta)
        npm version prerelease --preid=beta -m "Release %s"
        ;;
    *)
        echo "Invalid version type: $VERSION_TYPE"
        exit 1
        ;;
esac

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")

echo "✅ Created version $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  git push && git push --tags"
echo "  npm publish --access public"
