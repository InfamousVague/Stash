# Stash — Build, Sign, Notarize, Install
# Usage:
#   make              — full pipeline: build → sign → notarize → install
#   make build        — tauri release build
#   make sign         — post-build signing only (no rebuild)
#   make notarize     — notarize + staple the DMG
#   make install      — install notarized app to /Applications
#   make release      — bump patch, commit, tag, push
#   make local-release — bump + build + sign + notarize + upload DMG
#   make dev          — run in dev mode
#   make clean        — remove build artifacts

SHELL := /bin/bash
ROOT  := $(shell pwd)
TAURI := $(ROOT)/src-tauri

# Load credentials from .env.apple
-include $(ROOT)/.env.apple

export APPLE_SIGNING_IDENTITY

IDENTITY      := $(APPLE_SIGNING_IDENTITY)
APPLE_ID      ?= InfamousVagueRat@gmail.com
TEAM_ID       := $(APPLE_TEAM_ID)
TEAM_ID       ?= F6ZAL7ANAD
VERSION       := $(shell grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')
APP_BUNDLE    := $(TAURI)/target/release/bundle/macos/Stash.app
DMG           := $(TAURI)/target/release/bundle/dmg/Stash_$(VERSION)_aarch64.dmg
INSTALL_PATH  := /Applications/Stash.app

.PHONY: all build sign notarize staple install dev release local-release clean help

## Default: full pipeline
all: build sign notarize install
	@echo ""
	@echo "✓ Done — Stash.app installed and notarized"

## Build Tauri release
build:
	@echo "=== Building Tauri release ==="
	cd $(ROOT) && npm run tauri build -- --bundles app,dmg

## Post-build: sign everything with hardened runtime + rebuild DMG
sign:
	@echo "=== Signing ==="
	cd $(TAURI) && bash scripts/post-build.sh

## Notarize the DMG with Apple
notarize:
	@echo "=== Notarizing ==="
	@if [ -z "$(APPLE_PASSWORD)" ]; then \
		echo "ERROR: APPLE_PASSWORD not set. Check .env.apple"; exit 1; \
	fi
	xcrun notarytool submit "$(DMG)" \
		--apple-id "$(APPLE_ID)" \
		--team-id "$(TEAM_ID)" \
		--password "$(APPLE_PASSWORD)" \
		--wait
	@echo "=== Stapling ==="
	xcrun stapler staple "$(DMG)"

## Staple notarization ticket to DMG (standalone)
staple:
	@echo "=== Stapling ==="
	xcrun stapler staple "$(DMG)"

## Install notarized app from DMG to /Applications
install: staple
	@echo "=== Installing ==="
	hdiutil attach "$(DMG)" -quiet -nobrowse -mountpoint /tmp/stash-dmg
	rm -rf "$(INSTALL_PATH)"
	ditto /tmp/stash-dmg/Stash.app "$(INSTALL_PATH)"
	hdiutil detach /tmp/stash-dmg -quiet
	@echo "Installed: $(INSTALL_PATH)"
	@spctl --assess --type execute --verbose "$(INSTALL_PATH)" 2>&1

## Dev mode
dev:
	cd $(ROOT) && npm run tauri dev

## Bump version, commit, tag, push
BUMP ?= patch

release:
	@CURRENT=$(VERSION); \
	IFS='.' read -r MAJOR MINOR PATCH <<< "$$CURRENT"; \
	if [ "$(BUMP)" = "major" ]; then \
		MAJOR=$$((MAJOR + 1)); MINOR=0; PATCH=0; \
	elif [ "$(BUMP)" = "minor" ]; then \
		MINOR=$$((MINOR + 1)); PATCH=0; \
	else \
		PATCH=$$((PATCH + 1)); \
	fi; \
	NEW="$$MAJOR.$$MINOR.$$PATCH"; \
	echo "=== Bumping $$CURRENT → $$NEW ==="; \
	sed -i '' "s/\"version\": \"$$CURRENT\"/\"version\": \"$$NEW\"/" src-tauri/tauri.conf.json; \
	sed -i '' "s/^version = \"$$CURRENT\"/version = \"$$NEW\"/" src-tauri/Cargo.toml; \
	git add src-tauri/tauri.conf.json src-tauri/Cargo.toml; \
	git commit -m "Stash v$$NEW"; \
	git tag -a "v$$NEW" -m "Stash v$$NEW"; \
	git push origin main; \
	git push origin "v$$NEW"; \
	echo ""; \
	echo "✓ v$$NEW tagged and pushed"

## Local release: bump + build + sign + notarize + upload to GitHub
local-release:
	@CURRENT=$(VERSION); \
	IFS='.' read -r MAJOR MINOR PATCH <<< "$$CURRENT"; \
	if [ "$(BUMP)" = "major" ]; then \
		MAJOR=$$((MAJOR + 1)); MINOR=0; PATCH=0; \
	elif [ "$(BUMP)" = "minor" ]; then \
		MINOR=$$((MINOR + 1)); PATCH=0; \
	else \
		PATCH=$$((PATCH + 1)); \
	fi; \
	NEW="$$MAJOR.$$MINOR.$$PATCH"; \
	echo "=== Bumping $$CURRENT → $$NEW ==="; \
	sed -i '' "s/\"version\": \"$$CURRENT\"/\"version\": \"$$NEW\"/" src-tauri/tauri.conf.json; \
	sed -i '' "s/^version = \"$$CURRENT\"/version = \"$$NEW\"/" src-tauri/Cargo.toml; \
	git add src-tauri/tauri.conf.json src-tauri/Cargo.toml; \
	git commit -m "Stash v$$NEW"
	$(MAKE) all
	@NEW=$$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/'); \
	DMG="$(TAURI)/target/release/bundle/dmg/Stash_$${NEW}_aarch64.dmg"; \
	git tag -a "v$$NEW" -m "Stash v$$NEW"; \
	git push origin main; \
	git push origin "v$$NEW"; \
	gh release create "v$$NEW" \
		"$$DMG" \
		--title "Stash v$$NEW" \
		--notes "Signed and notarized macOS release." \
		--latest; \
	echo ""; \
	echo "✓ v$$NEW released and uploaded"

## Remove build artifacts
clean:
	rm -rf $(TAURI)/target/release/bundle
	@echo "Cleaned"

help:
	@echo "Targets: all build sign notarize staple install dev release local-release clean"
	@echo ""
	@echo "  make              — full pipeline: build → sign → notarize → install"
	@echo "  make build        — Tauri release build"
	@echo "  make sign         — post-build signing (no rebuild)"
	@echo "  make notarize     — notarize + staple DMG"
	@echo "  make install      — install to /Applications"
	@echo "  make release      — bump patch ($(VERSION) → next), tag, push"
	@echo "  make local-release — bump + full local build + upload to GitHub"
