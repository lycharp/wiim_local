import os

# Device configurations
DEVICES = {
    'amp': {
        'name': 'WiiM Amp',
        'ip': '192.168.0.106',
        'Default': False
    },
    'mini': {
        'name': 'WiiM Mini',
        'ip': '192.168.0.103',
        'Default': True
    }
}

# Spotify API credentials
Spotify = {
    'SPOTIFY_CLIENT_ID': os.getenv('SPOTIFY_CLIENT_ID', ''),  # Get from environment variable
    'SPOTIFY_CLIENT_SECRET': os.getenv('SPOTIFY_CLIENT_SECRET', '')  # Get from environment variable
}

# Refresh rate for polling WiiM devices
Refresh_Rate = {
    'Refresh': 10  # Refresh rate in seconds
}

# Default for Debugging
Debug = False
