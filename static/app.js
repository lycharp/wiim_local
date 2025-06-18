document.addEventListener('DOMContentLoaded', function() {
    const statusBtn = document.getElementById('status-btn');
    const playerStatusBtn = document.getElementById('player-status-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const muteToggleBtn = document.getElementById('mute-toggle-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValue = document.getElementById('volume-value');
    const progressSlider = document.getElementById('progress-slider');
    const progressValue = document.getElementById('progress-value');
    const statusJson = document.getElementById('status-json');
    const playerStatusJson = document.getElementById('player-status-json');
    const copyStatus = document.getElementById('copy-status');
    const copyPlayerStatus = document.getElementById('copy-player-status');
    const deviceSwitcherBtn = document.getElementById('device-switcher-btn');
    const debugToggle = document.getElementById('debug-toggle');
    const refreshRateSlider = document.getElementById('refresh-rate-slider');
    const refreshRateValue = document.getElementById('refresh-rate-value');
    const deviceSwitcherModal = new bootstrap.Modal(document.getElementById('deviceSwitcherModal'));
    let currentDevice = null;
    let updateInterval = null;
    let lastArtist = '';
    let lastAlbum = '';
    let forceAlbumArtUpdate = false;
    let isSeeking = false;

    // Player info elements
    const vendorInfo = document.getElementById('vendor-info');
    const titleInfo = document.getElementById('title-info');
    const artistInfo = document.getElementById('artist-info');
    const albumInfo = document.getElementById('album-info');
    const statusInfo = document.getElementById('status-info');

    // Track mute state
    let currentMuteState = 0;

    const actionButtons = [playPauseBtn, prevBtn, nextBtn, muteToggleBtn];
    function highlightButton(btn) {
        actionButtons.forEach(b => b.classList.remove('active-action'));
        if (btn) btn.classList.add('active-action');
    }

    // Function to decode hex to ASCII
    function hexToAscii(hex) {
        if (!hex) return '-';
        try {
            // Remove any spaces and ensure we have an even number of characters
            hex = hex.replace(/\s+/g, '');
            if (hex.length % 2 !== 0) return hex;
            
            let result = '';
            for (let i = 0; i < hex.length; i += 2) {
                const byte = parseInt(hex.substr(i, 2), 16);
                if (byte >= 32 && byte <= 126) { // Only convert printable ASCII
                    result += String.fromCharCode(byte);
                } else {
                    result += ' ';
                }
            }
            return result.trim();
        } catch (e) {
            console.error('Error decoding hex:', e);
            return hex;
        }
    }

    // Function to format vendor string
    function formatVendor(vendor) {
        if (!vendor) return '-';
        const colonIndex = vendor.indexOf(':');
        const vendorName = colonIndex !== -1 ? vendor.substring(0, colonIndex) : vendor;
        return vendorName.charAt(0).toUpperCase() + vendorName.slice(1).toLowerCase();
    }

    // Function to format status string
    function formatStatus(status) {
        if (!status) return '-';
        return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    }

    // Function to format time in MM:SS format
    function formatTime(ms) {
        if (!ms || ms <= 0) return '0:00';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Function to seek to position
    async function seekToPosition(position) {
        try {
            await fetch('/api/seek', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({position: position})
            });
        } catch (error) {
            console.error('Error seeking to position:', error);
        }
    }

    // Function to update player info
    async function updatePlayerInfo() {
        try {
            const resp = await fetch('/api/playerstatus');
            const data = await resp.json();
            
            if (data) {
                const currentArtist = hexToAscii(data.Artist) || '-';
                const currentAlbum = hexToAscii(data.Album) || '-';
                
                // Update player info
                vendorInfo.textContent = formatVendor(data.vendor) || '-';
                titleInfo.textContent = hexToAscii(data.Title) || '-';
                artistInfo.textContent = currentArtist;
                albumInfo.textContent = currentAlbum;
                statusInfo.textContent = formatStatus(data.status) || '-';

                // Update mute button state
                if (data.mute !== undefined) {
                    currentMuteState = parseInt(data.mute);
                    muteToggleBtn.textContent = currentMuteState === 1 ? 'UnMute' : 'Mute';
                }

                // Update play/pause button icon based on status
                if (data.status) {
                    const playPauseIcon = playPauseBtn.querySelector('i');
                    if (data.status === 'play') {
                        playPauseIcon.classList.remove('bi-play-fill');
                        playPauseIcon.classList.add('bi-pause-fill');
                    } else {
                        playPauseIcon.classList.remove('bi-pause-fill');
                        playPauseIcon.classList.add('bi-play-fill');
                    }
                }

                // Always update volume from player status
                if (typeof data.vol !== 'undefined') {
                    const newVolume = parseInt(data.vol);
                    volumeValue.textContent = newVolume;
                    // Only update slider if it's not being actively used
                    if (!volumeSlider.classList.contains('active-action')) {
                        volumeSlider.value = newVolume;
                    }
                }

                // Update progress slider
                if (data.curpos !== undefined && data.totlen !== undefined && !isSeeking) {
                    const currentPos = parseInt(data.curpos);
                    const totalLen = parseInt(data.totlen);
                    
                    console.log('Progress data:', { currentPos, totalLen, isSeeking }); // Debug log
                    
                    if (totalLen > 0) {
                        const progressPercent = Math.floor((currentPos / totalLen) * 100);
                        progressSlider.value = progressPercent;
                        progressSlider.setAttribute('data-total-duration', totalLen);
                        
                        const currentTimeFormatted = formatTime(currentPos);
                        const totalTimeFormatted = formatTime(totalLen);
                        console.log('Formatted times:', { currentTimeFormatted, totalTimeFormatted }); // Debug log
                        progressValue.textContent = `${currentTimeFormatted} / ${totalTimeFormatted}`;
                    }
                }

                // Only fetch album art if artist/album changed or force update is set
                if (forceAlbumArtUpdate || currentArtist !== lastArtist || currentAlbum !== lastAlbum) {
                    try {
                        console.log('Fetching album art...');  // Debug log
                        const albumArtResp = await fetch('/api/album-art');
                        const albumArtData = await albumArtResp.json();
                        console.log('Album art response:', albumArtData);  // Debug log
                        
                        const albumArtImg = document.getElementById('album-art');
                        console.log('Album art image element:', albumArtImg);  // Debug log
                        
                        if (albumArtData.image_url) {
                            console.log('Setting album art URL:', albumArtData.image_url);  // Debug log
                            albumArtImg.src = albumArtData.image_url;
                            albumArtImg.style.display = 'block';
                            
                            // Verify image loading
                            albumArtImg.onload = () => {
                                console.log('Album art image loaded successfully');  // Debug log
                            };
                            albumArtImg.onerror = (error) => {
                                console.error('Error loading album art image:', error);  // Debug log
                                albumArtImg.style.display = 'none';
                            };
                        } else {
                            console.log('No album art URL found in response');  // Debug log
                            albumArtImg.style.display = 'none';
                        }

                        // Update last known values
                        lastArtist = currentArtist;
                        lastAlbum = currentAlbum;
                        forceAlbumArtUpdate = false;
                    } catch (error) {
                        console.error('Error fetching album art:', error);  // Debug log
                        document.getElementById('album-art').style.display = 'none';
                    }
                }
            }
        } catch (error) {
            console.error('Error updating player info:', error);
        }
    }

    // Function to update device info
    async function updateDeviceInfo() {
        try {
            const resp = await fetch('/api/device/current');
            const data = await resp.json();
            currentDevice = data;
            
            // Update device name in header
            document.querySelector('h4.mb-0').textContent = `${data.name} Controller`;
            
            // Update device selection in modal
            document.querySelectorAll('.device-option').forEach(button => {
                button.classList.toggle('active', button.dataset.deviceId === data.id);
            });
        } catch (error) {
            console.error('Error updating device info:', error);
        }
    }

    // Function to update debug mode state
    async function updateDebugState() {
        try {
            const resp = await fetch('/api/debug/status');
            const data = await resp.json();
            debugToggle.checked = data.debug_mode;
        } catch (error) {
            console.error('Error getting debug status:', error);
        }
    }

    // Function to start periodic updates
    async function startPeriodicUpdates() {
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        try {
            // Get refresh rate from server
            const resp = await fetch('/api/refresh-rate');
            const data = await resp.json();
            const refreshRate = data.refresh_rate * 1000; // Convert seconds to milliseconds
            
            // Start new interval
            updateInterval = setInterval(async () => {
                await checkStatus();
                await updatePlayerInfo();
            }, refreshRate);
        } catch (error) {
            console.error('Error getting refresh rate:', error);
            // Fallback to default 30 seconds if there's an error
            updateInterval = setInterval(async () => {
                await checkStatus();
                await updatePlayerInfo();
            }, 30000);
        }
    }

    // Function to update refresh rate
    async function updateRefreshRate(value) {
        try {
            const resp = await fetch('/api/refresh-rate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refresh_rate: value })
            });
            const data = await resp.json();
            if (data.success) {
                // Restart periodic updates with new refresh rate
                startPeriodicUpdates();
            }
        } catch (error) {
            console.error('Error updating refresh rate:', error);
        }
    }

    // Refresh rate slider change
    let refreshRateTimeout;
    refreshRateSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        refreshRateValue.textContent = `${value}s`;
        
        // Clear any existing timeout
        clearTimeout(refreshRateTimeout);
        
        // Set a new timeout to update the refresh rate after the user stops sliding
        refreshRateTimeout = setTimeout(() => {
            updateRefreshRate(value);
        }, 500);
    });

    // Initialize refresh rate from server
    async function initializeRefreshRate() {
        try {
            const resp = await fetch('/api/refresh-rate');
            const data = await resp.json();
            const currentRate = data.refresh_rate;
            refreshRateSlider.value = currentRate;
            refreshRateValue.textContent = `${currentRate}s`;
        } catch (error) {
            console.error('Error getting refresh rate:', error);
        }
    }

    // Initialize refresh rate
    initializeRefreshRate();

    // Initial player info fetch
    updatePlayerInfo();

    // Initialize device info and start updates
    updateDeviceInfo();
    startPeriodicUpdates();

    // Show status modal
    statusBtn.addEventListener('click', async () => {
        const resp = await fetch('/api/status');
        const data = await resp.json();
        statusJson.textContent = JSON.stringify(data, null, 2);
        const modal = new bootstrap.Modal(document.getElementById('statusModal'));
        modal.show();
    });

    // Show player status modal
    playerStatusBtn.addEventListener('click', async () => {
        const resp = await fetch('/api/playerstatus');
        const data = await resp.json();
        if (data) {
            // Create a copy of the data with decoded hex values
            const displayData = { ...data };
            displayData.Title = hexToAscii(data.Title);
            displayData.Artist = hexToAscii(data.Artist);
            displayData.Album = hexToAscii(data.Album);
            displayData.vendor = formatVendor(data.vendor);
            playerStatusJson.textContent = JSON.stringify(displayData, null, 2);
        }
        const modal = new bootstrap.Modal(document.getElementById('playerStatusModal'));
        modal.show();
    });

    // Copy status JSON
    copyStatus.addEventListener('click', () => {
        navigator.clipboard.writeText(statusJson.textContent);
    });

    // Copy player status JSON
    copyPlayerStatus.addEventListener('click', () => {
        navigator.clipboard.writeText(playerStatusJson.textContent);
    });

    // Play/Pause
    playPauseBtn.addEventListener('click', async () => {
        highlightButton(playPauseBtn);
        await fetch('/api/toggle', {method: 'POST'});
        setTimeout(updatePlayerInfo, 500);
    });

    // Previous Track
    prevBtn.addEventListener('click', async () => {
        highlightButton(prevBtn);
        await fetch('/api/prev', {method: 'POST'});
        setTimeout(updatePlayerInfo, 500);
    });

    // Next Track
    nextBtn.addEventListener('click', async () => {
        highlightButton(nextBtn);
        await fetch('/api/next', {method: 'POST'});
        setTimeout(updatePlayerInfo, 500);
    });

    // Mute Toggle
    muteToggleBtn.addEventListener('click', async () => {
        highlightButton(muteToggleBtn);
        const newMuteValue = currentMuteState === 1 ? 0 : 1;
        await fetch('/api/mute', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({n: newMuteValue})
        });
        setTimeout(updatePlayerInfo, 500);
    });

    // Volume slider
    let volumeTimeout;
    volumeSlider.addEventListener('input', async (e) => {
        const value = e.target.value;
        volumeValue.textContent = value;
        volumeSlider.classList.add('active-action');
        volumeValue.classList.add('active-action');
        clearTimeout(volumeTimeout);
        volumeTimeout = setTimeout(() => {
            volumeSlider.classList.remove('active-action');
            volumeValue.classList.remove('active-action');
        }, 1000);
        await fetch('/api/volume', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({value})
        });
        setTimeout(updatePlayerInfo, 500);
    });

    // Device switcher button click
    deviceSwitcherBtn.addEventListener('click', () => {
        deviceSwitcherModal.show();
    });

    // Device option click
    document.querySelectorAll('.device-option').forEach(button => {
        button.addEventListener('click', async () => {
            const deviceId = button.dataset.deviceId;
            try {
                console.log('Switching to device:', deviceId);  // Debug log
                const resp = await fetch('/api/device/switch', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ device_id: deviceId })
                });
                const data = await resp.json();
                if (data.success) {
                    console.log('Device switch successful, refreshing data...');  // Debug log
                    deviceSwitcherModal.hide();
                    
                    // First check status to get fresh device info including SSID
                    await checkStatus();
                    
                    // Then update other info
                    await updateDeviceInfo();
                    forceAlbumArtUpdate = true;
                    await updatePlayerInfo();
                    
                    // Restart periodic updates
                    if (updateInterval) {
                        clearInterval(updateInterval);
                    }
                    startPeriodicUpdates();
                    
                    console.log('Device switch complete, current device:', currentDevice);  // Debug log
                }
            } catch (error) {
                console.error('Error switching device:', error);
            }
        });
    });

    // Debug toggle change
    debugToggle.addEventListener('change', async () => {
        try {
            const resp = await fetch('/api/debug/toggle', {
                method: 'POST'
            });
            const data = await resp.json();
            debugToggle.checked = data.debug_mode;
        } catch (error) {
            console.error('Error toggling debug mode:', error);
        }
    });

    // Function to check device status
    async function checkStatus() {
        try {
            console.log('Checking device status...');  // Debug log
            const resp = await fetch('/api/status');
            const data = await resp.json();
            
            if (data) {
                console.log('Status response:', data);  // Debug log
                
                // Update device name in header
                const deviceNameElement = document.querySelector('h1.display-5');
                if (deviceNameElement && data.DeviceName) {
                    deviceNameElement.innerHTML = `${data.DeviceName} <small class="text-secondary">(${data.ssid || '-'})</small>`;
                }
                
                // Update status JSON display
                statusJson.textContent = JSON.stringify(data, null, 2);
                
                // Update current device
                currentDevice = data.device;
                
                console.log('Status update complete, SSID:', data.ssid);  // Debug log
            }
        } catch (error) {
            console.error('Error checking status:', error);
        }
    }

    // Progress slider
    let seekTimeout;
    progressSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const totalDuration = parseInt(progressSlider.getAttribute('data-total-duration') || 0);
        const currentTime = Math.floor((value / 100) * totalDuration / 1000); // Convert to seconds
        
        console.log('Slider input:', { value, totalDuration, currentTime }); // Debug log
        
        // Update the display immediately
        const currentTimeFormatted = formatTime(currentTime * 1000);
        const totalTimeFormatted = formatTime(totalDuration);
        console.log('Slider formatted times:', { currentTimeFormatted, totalTimeFormatted }); // Debug log
        progressValue.textContent = `${currentTimeFormatted} / ${totalTimeFormatted}`;
        
        // Clear any existing timeout
        clearTimeout(seekTimeout);
        
        // Set a new timeout to seek after the user stops sliding
        seekTimeout = setTimeout(() => {
            seekToPosition(currentTime);
        }, 500);
    });

    // Progress slider mouse down/up events
    progressSlider.addEventListener('mousedown', () => {
        isSeeking = true;
        progressSlider.classList.add('active-action');
        progressValue.classList.add('active-action');
    });

    progressSlider.addEventListener('mouseup', () => {
        isSeeking = false;
        setTimeout(() => {
            progressSlider.classList.remove('active-action');
            progressValue.classList.remove('active-action');
        }, 1000);
    });
}); 