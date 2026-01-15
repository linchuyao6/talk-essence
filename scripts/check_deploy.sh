
# Validating for compatibility...
# Check Node.js version
node -v

# Look for Dockerfile
if [ -f "Dockerfile" ]; then
    echo "Dockerfile exists."
else
    echo "Dockerfile missing. Creating is recommended."
fi

# Check next.config.ts for standalone mode
grep "standalone" next.config.ts
