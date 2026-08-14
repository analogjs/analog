#!/bin/bash
echo "Publishing to $RELEASE_TAG"
node tools/scripts/release-artifacts.mts publish --tag "$RELEASE_TAG"
