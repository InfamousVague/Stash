#!/bin/bash
# Stash Watch App - Project Setup Script
# This script helps set up the Xcode project for the Stash watchOS app.

set -e
cd "$(dirname "$0")"

echo "=== Stash Watch App - Project Setup ==="
echo ""

# Check if xcodegen is available
if command -v xcodegen &> /dev/null; then
    echo "[OK] xcodegen found. Generating Xcode project..."
    xcodegen generate
    echo ""
    echo "[OK] Project generated successfully!"
    echo "     Open: Stash Watch.xcodeproj"
else
    echo "[!] xcodegen is not installed."
    echo ""
    echo "Option 1: Install xcodegen and run this script again:"
    echo "    brew install xcodegen"
    echo "    ./create-project.sh"
    echo ""
    echo "Option 2: Create the project manually in Xcode:"
    echo ""
    echo "    1. Open Xcode -> File -> New -> Project"
    echo "    2. Select watchOS -> App"
    echo "    3. Product Name: Stash Watch App"
    echo "    4. Bundle ID: com.mattssoftware.stash.watchkitapp"
    echo "    5. Interface: SwiftUI"
    echo "    6. Save to: $(pwd)"
    echo ""
    echo "    7. Delete the auto-generated Swift files"
    echo "    8. Drag in the 'Stash Watch App' folder contents"
    echo ""
    echo "    9. File -> New -> Target -> watchOS -> Widget Extension"
    echo "   10. Product Name: StashWidgets"
    echo "   11. Bundle ID: com.mattssoftware.stash.watchkitapp.widgets"
    echo "   12. Delete auto-generated files, drag in StashWidgets/ contents"
    echo ""
    echo "    13. Add App Groups capability to both targets:"
    echo "        group.com.mattssoftware.stash.watchkitapp"
    echo ""
    echo "    14. Add Sign in with Apple capability to the app target"
    echo ""
    echo "    15. Set deployment target to watchOS 10.0"
    echo ""
    echo "File structure:"
    echo ""
    find . -name "*.swift" -o -name "*.json" -o -name "*.plist" -o -name "*.entitlements" -o -name "*.png" | sort | sed 's|^\./|    |'
fi

echo ""
echo "=== Done ==="
