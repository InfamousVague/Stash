#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "Building stash-apple-signin..."
swiftc -O \
    -o stash-apple-signin \
    main.swift \
    -framework Cocoa \
    -framework AuthenticationServices

echo "Signing with entitlement..."
codesign --force \
    --sign "Developer ID Application: Matt Wisniewski (F6ZAL7ANAD)" \
    --entitlements entitlements.plist \
    --options runtime \
    stash-apple-signin

echo "Verifying..."
codesign -dvvv stash-apple-signin 2>&1 | grep -E "Identifier|Entitlements|Authority" | head -5

echo "Done: $(pwd)/stash-apple-signin"
