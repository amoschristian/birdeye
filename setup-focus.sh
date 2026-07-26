#!/bin/bash
set -e

echo "=== Birdeye: Wayland focus setup ==="

# Download ydotool
echo "[1/5] Downloading ydotool..."
wget -q -O /tmp/ydotool https://github.com/ReimuNotMoe/ydotool/releases/download/v1.0.4/ydotool-release-ubuntu-latest
wget -q -O /tmp/ydotoold https://github.com/ReimuNotMoe/ydotool/releases/download/v1.0.4/ydotoold-release-ubuntu-latest
chmod +x /tmp/ydotool /tmp/ydotoold

# Install binaries
echo "[2/5] Installing ydotool..."
sudo install -m 755 /tmp/ydotool /usr/local/bin/ydotool
sudo install -m 755 /tmp/ydotoold /usr/local/bin/ydotoold

# Load uinput
echo "[3/5] Loading uinput kernel module..."
sudo modprobe uinput
echo "uinput" | sudo tee /etc/modules-load.d/uinput.conf

# udev rule
echo "[4/5] Setting up uinput permissions..."
sudo tee /etc/udev/rules.d/99-uinput.rules > /dev/null << 'RULE'
KERNEL=="uinput", MODE="0660", GROUP="input", OPTIONS+="static_node=uinput"
RULE
sudo udevadm control --reload-rules
sudo udevadm trigger
sudo usermod -aG input "$USER"

# Systemd service
echo "[5/5] Creating ydotoold systemd service..."
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/ydotoold.service << 'SERVICE'
[Unit]
Description=ydotoold - input emulation daemon

[Service]
ExecStart=/usr/local/bin/ydotoold
Restart=always

[Install]
WantedBy=default.target
SERVICE
systemctl --user daemon-reload
systemctl --user enable --now ydotoold

echo ""
echo "=== Setup complete! ==="
echo "Log out and back in for group changes to take effect."
echo "Then test with: ydotoold & ydotool key alt+Tab"
