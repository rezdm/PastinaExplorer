#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="$SCRIPT_DIR/dist"

rm -rf "$DIST"
mkdir -p "$DIST/images" "$DIST/errors"

# JSON: compact + gzip
jq -c . "$SCRIPT_DIR/pois-data.json" | gzip -9 > "$DIST/pois-data.json.gz"

# JS: minify with terser
npx --yes terser "$SCRIPT_DIR/script.js" --compress --mangle -o "$DIST/script.js"

# CSS: minify with clean-css-cli
npx --yes clean-css-cli "$SCRIPT_DIR/styles.css" -o "$DIST/styles.css"

# HTML: minify with html-minifier-terser
npx --yes html-minifier-terser \
    --collapse-whitespace \
    --remove-comments \
    --minify-css true \
    --minify-js true \
    -o "$DIST/index.html" \
    "$SCRIPT_DIR/index.html"

# Copy static assets
cp "$SCRIPT_DIR/favicon.ico" "$DIST/"
cp "$SCRIPT_DIR/googlebd7b588dcbae4e55.html" "$DIST/"
cp "$SCRIPT_DIR/pastina-preview.png" "$DIST/"
cp -r "$SCRIPT_DIR/images/." "$DIST/images/"
cp -r "$SCRIPT_DIR/errors/." "$DIST/errors/"

# Sitemap
SITE_URL="https://pastina.reznitsky.info"
TODAY=$(date -u +%Y-%m-%d)

cat > "$DIST/sitemap.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${TODAY}</lastmod>
    <priority>1.0</priority>
  </url>
</urlset>
EOF

echo ""
echo "Build complete. Output in $DIST/"
echo ""
ls -lh "$DIST/"
