# CommonGround Bash Configuration

# Project-specific environment variables
export PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export NODE_ENV=${NODE_ENV:-development}

# Aliases for common development tasks
alias dev="npm run dev"
alias build="npm run build"
alias preview="npm run preview"
alias install="npm install"

# Add project scripts to PATH
export PATH="$PROJECT_ROOT/scripts:$PATH"

# Load .env if it exists
if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(cat "$PROJECT_ROOT/.env" | xargs)
fi
