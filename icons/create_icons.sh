#!/bin/bash
# Simple PNG icon creation using ImageMagick (if available)
if command -v convert &> /dev/null; then
    echo "Creating PNG icons..."
    convert -size 128x128 -background "linear-gradient(135deg,#667eea,#764ba2)" \
            -fill white -pointsize 72 -font Arial-Bold \
            -gravity center label:"AI" icon128.png
    convert icon128.png -resize 48x48 icon48.png
    convert icon128.png -resize 16x16 icon16.png
    echo "Icons created successfully!"
else
    echo "ImageMagick not found. Creating placeholder files..."
    # Create empty placeholder files
    touch icon16.png icon48.png icon128.png
    echo "⚠️ Please manually create icon16.png, icon48.png, and icon128.png"
    echo "   Or use online tools like: https://www.favicon-generator.org/"
fi
