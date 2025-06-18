from flask import Flask, render_template, request, jsonify, session
import requests
from flask_cors import CORS
import urllib.parse
import os
import time
import base64
from config import DEVICES, Spotify, Refresh_Rate, Debug

app = Flask(__name__)
CORS(app)
app.secret_key = os.urandom(24)  # Required for session

# Debug mode flag
DEBUG_MODE = Debug

# Spotify API credentials
SPOTIFY_CLIENT_ID = Spotify['SPOTIFY_CLIENT_ID']
SPOTIFY_CLIENT_SECRET = Spotify['SPOTIFY_CLIENT_SECRET']
SPOTIFY_TOKEN = None
SPOTIFY_TOKEN_EXPIRY = 0

def log_debug(message):
    if DEBUG_MODE:
        print(f"[DEBUG] {message}")

def get_current_device():
    device_id = session.get('current_device', next((k for k, v in DEVICES.items() if v.get('Default', False)), 'amp'))
    device = DEVICES[device_id]
    device['id'] = device_id  # Add device ID to the response
    return device

def get_base_url():
    device = get_current_device()
    return f'https://{device["ip"]}/httpapi.asp'

# Helper to make requests to WiiM device, ignoring SSL
def wiim_api_call(command):
    try:
        base_url = get_base_url()
        log_debug(f"Making API call to {base_url} with command: {command}")
        resp = requests.get(base_url, params={'command': command}, verify=False, timeout=5)
        resp.raise_for_status()
        if 'getStatusEx' in command or 'getPlayerStatus' in command:
            return resp.json()
        return resp.text
    except Exception as e:
        log_debug(f"API call error: {str(e)}")
        return {'error': str(e)}

@app.route('/api/device/switch', methods=['POST'])
def switch_device():
    device_id = request.json.get('device_id')
    if device_id in DEVICES:
        session['current_device'] = device_id
        device = DEVICES[device_id].copy()
        device['id'] = device_id  # Add device ID to the response
        log_debug(f"Switched to device: {device['name']}")
        return jsonify({'success': True, 'device': device})
    return jsonify({'error': 'Invalid device'}), 400

@app.route('/api/device/current')
def get_current_device_info():
    device = get_current_device()
    return jsonify(device)

@app.route('/api/device/list')
def get_device_list():
    return jsonify(DEVICES)

@app.route('/api/debug/status')
def get_debug_status():
    return jsonify({'debug_mode': DEBUG_MODE})

@app.route('/api/debug/toggle', methods=['POST'])
def toggle_debug():
    global DEBUG_MODE
    DEBUG_MODE = not DEBUG_MODE
    log_debug(f"Debug mode {'enabled' if DEBUG_MODE else 'disabled'}")
    return jsonify({'debug_mode': DEBUG_MODE})

@app.route('/')
def index():
    # On load, get status and player status
    status = wiim_api_call('getStatusEx')
    player_status = wiim_api_call('getPlayerStatus')
    # Extract volume from player_status if possible
    try:
        if isinstance(player_status, dict) and 'vol' in player_status:
            volume = player_status['vol']
        else:
            volume = 0
    except Exception:
        volume = 0
    return render_template('index.html', status=status, volume=volume, devices=DEVICES)

@app.route('/api/status')
def api_status():
    return jsonify(wiim_api_call('getStatusEx'))

@app.route('/api/toggle', methods=['POST'])
def api_toggle():
    return jsonify({'result': wiim_api_call('setPlayerCmd:onepause')})

@app.route('/api/volume', methods=['POST'])
def api_volume():
    value = request.json.get('value')
    return jsonify({'result': wiim_api_call(f'setPlayerCmd:vol:{value}')})

@app.route('/api/mute', methods=['POST'])
def api_mute():
    n = request.json.get('n')
    return jsonify({'result': wiim_api_call(f'setPlayerCmd:mute:{n}')})

@app.route('/api/playerstatus')
def api_playerstatus():
    return jsonify(wiim_api_call('getPlayerStatus'))

@app.route('/api/next', methods=['POST'])
def api_next():
    return jsonify({'result': wiim_api_call('setPlayerCmd:next')})

@app.route('/api/prev', methods=['POST'])
def api_prev():
    return jsonify({'result': wiim_api_call('setPlayerCmd:prev')})

@app.route('/api/seek', methods=['POST'])
def api_seek():
    position = request.json.get('position')
    return jsonify({'result': wiim_api_call(f'setPlayerCmd:seek:{position}')})

@app.route('/api/refresh-rate')
def get_refresh_rate():
    return jsonify({'refresh_rate': Refresh_Rate['Refresh']})

@app.route('/api/refresh-rate', methods=['POST'])
def update_refresh_rate():
    try:
        new_rate = int(request.json.get('refresh_rate', 30))
        if 5 <= new_rate <= 30:
            Refresh_Rate['Refresh'] = new_rate
            return jsonify({'success': True, 'refresh_rate': new_rate})
        return jsonify({'error': 'Refresh rate must be between 5 and 30 seconds'}), 400
    except ValueError:
        return jsonify({'error': 'Invalid refresh rate value'}), 400

def get_spotify_token():
    global SPOTIFY_TOKEN, SPOTIFY_TOKEN_EXPIRY
    
    # If token exists and is not expired, return it
    if SPOTIFY_TOKEN and time.time() < SPOTIFY_TOKEN_EXPIRY:
        return SPOTIFY_TOKEN
    
    try:
        # Get new token
        auth_url = 'https://accounts.spotify.com/api/token'
        auth_data = {
            'grant_type': 'client_credentials'
        }
        auth_headers = {
            'Authorization': f'Basic {base64.b64encode(f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}".encode()).decode()}'
        }
        
        response = requests.post(auth_url, data=auth_data, headers=auth_headers)
        response.raise_for_status()
        
        token_data = response.json()
        SPOTIFY_TOKEN = token_data['access_token']
        SPOTIFY_TOKEN_EXPIRY = time.time() + token_data['expires_in'] - 60  # Subtract 60 seconds for safety
        
        log_debug("Successfully refreshed Spotify token")
        return SPOTIFY_TOKEN
    except Exception as e:
        log_debug(f"Error refreshing Spotify token: {str(e)}")
        return None

@app.route('/api/album-art')
def api_album_art():
    try:
        # Get current player status to get artist and album info
        player_status = wiim_api_call('getPlayerStatus')
        log_debug(f"Player Status: {player_status}")
        
        if not isinstance(player_status, dict):
            log_debug("Error: Player status is not a dictionary")
            return jsonify({'error': 'Failed to get player status'})
        
        # Get artist and album from player status
        artist = hexToAscii(player_status.get('Artist', ''))
        album = hexToAscii(player_status.get('Album', ''))
        log_debug(f"Decoded Artist: {artist}")
        log_debug(f"Decoded Album: {album}")
        
        if not artist or not album:
            log_debug("Error: Missing artist or album information")
            return jsonify({'error': 'No artist or album information available'})
        
        # Get fresh Spotify token
        token = get_spotify_token()
        if not token:
            log_debug("Error: Failed to get Spotify token")
            return jsonify({'error': 'Failed to authenticate with Spotify'})
        
        # Encode artist for URL
        encoded_artist = urllib.parse.quote(artist)
        spotify_url = f'https://api.spotify.com/v1/search?q=artist:{encoded_artist}&type=album'
        log_debug(f"Spotify API URL: {spotify_url}")
        
        # Call Spotify API
        headers = {
            'Authorization': f'Bearer {token}'
        }
        spotify_response = requests.get(spotify_url, headers=headers)
        
        if spotify_response.status_code == 401:
            # Token expired, try to refresh and retry once
            token = get_spotify_token()
            if token:
                headers['Authorization'] = f'Bearer {token}'
                spotify_response = requests.get(spotify_url, headers=headers)
        
        spotify_response.raise_for_status()
        spotify_data = spotify_response.json()
        log_debug(f"Spotify API Response Status: {spotify_response.status_code}")
        
        # Find matching album and get image URL
        if 'albums' in spotify_data and 'items' in spotify_data['albums']:
            log_debug(f"Found {len(spotify_data['albums']['items'])} albums")
            for album_item in spotify_data['albums']['items']:
                log_debug(f"Checking album: {album_item['name']}")
                if album_item['name'].lower() == album.lower():
                    log_debug("Found matching album!")
                    # Find image with height 300
                    for image in album_item['images']:
                        if image['height'] == 300:
                            log_debug(f"Found image URL: {image['url']}")
                            return jsonify({'image_url': image['url']})
        else:
            log_debug("No albums found in Spotify response")
        
        return jsonify({'error': 'Album art not found'})
    except Exception as e:
        log_debug(f"Error in album art endpoint: {str(e)}")
        return jsonify({'error': str(e)})

def hexToAscii(hex_str):
    if not hex_str:
        return ''
    try:
        # Remove any spaces and ensure we have an even number of characters
        hex_str = hex_str.replace(' ', '')
        if len(hex_str) % 2 != 0:
            return hex_str
        
        result = ''
        for i in range(0, len(hex_str), 2):
            byte = int(hex_str[i:i+2], 16)
            if byte >= 32 and byte <= 126:  # Only convert printable ASCII
                result += chr(byte)
            else:
                result += ' '
        return result.strip()
    except:
        return hex_str

if __name__ == '__main__':
    app.run(debug=True) 