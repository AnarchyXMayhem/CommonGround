# macOS Bash Profile for CommonGround

# Source .bashrc if it exists
if [ -f ~/.bashrc ]; then
  source ~/.bashrc
fi

# Source project .bashrc when in project directory
if [ -f "$(pwd)/.bashrc" ]; then
  source "$(pwd)/.bashrc"
fi
