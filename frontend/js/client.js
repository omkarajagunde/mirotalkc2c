'use strict';

const roomId = new URLSearchParams(window.location.search).get('room');
const peerName = new URLSearchParams(window.location.search).get('name');

const loadingDivContainer = document.getElementById('loadingDivContainer');
const waitingDivContainer = document.getElementById('waitingDivContainer');
const copyRoomBtn = document.getElementById('copyRoomBtn');
const shareRoomBtn = document.getElementById('shareRoomBtn');
const initHideMeBtn = document.getElementById('initHideMeBtn');
const initAudioBtn = document.getElementById('initAudioBtn');
const initVideoBtn = document.getElementById('initVideoBtn');
const homeBtn = document.getElementById('homeBtn');
const buttonsBar = document.getElementById('buttonsBar');
const hideMeBtn = document.getElementById('hideMeBtn');
const audioBtn = document.getElementById('audioBtn');
const videoBtn = document.getElementById('videoBtn');
const swapCameraBtn = document.getElementById('swapCameraBtn');
const sendMsgBtn = document.getElementById('sendMsgBtn');
const settingsBtn = document.getElementById('settingsBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const endCallBtn = document.getElementById('endCallBtn');
const settings = document.getElementById('settings');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const audioSource = document.getElementById('audioSource');
const videoSource = document.getElementById('videoSource');

const roomURL = window.location.origin + '/?room=' + roomId;

const camOffImg = '../images/camOff.png';
const className = {
    user: 'fas fa-user',
    userOff: 'fas fa-user-slash',
    clock: 'fas fa-clock',
    audioOn: 'fas fa-microphone',
    audioOff: 'fas fa-microphone-slash',
    videoOn: 'fas fa-video',
    videoOff: 'fas fa-video-slash',
    screenOn: 'fas fa-desktop',
    screenOff: 'fas fa-stop-circle',
    fullScreenOn: 'fas fa-expand',
    fullScreenOff: 'fas fa-compress',
};

const swal = {
    background: '#202123',
    textColor: '#ffffff',
};

let userAgent;
let isWebRTCSupported = false;
let isMobileDevice = false;
let isTabletDevice = false;
let isIPadDevice = false;
let isDesktopDevice = false;
let isCamMirrored = false;
let myVideoChange = false;
let isVideoStreaming = true;
let isAudioStreaming = true;
let isScreenStreaming = false;
let camera = 'user';
let thisPeerId;
let peerConnection;
let signalingSocket;
let localMediaStream;
let remoteMediaStream;
let roomPeersCount = 0;
let peerDevice = {};
let peerConnections = {};
let peerMediaElements = {};
let dataChannels = {};

let audioDevices = [];
let videoDevices = [];

let myVideo;
let myVideoWrap;
let myVideoAvatarImage;
let myAudioStatusIcon;

function getDocumentElementsById() {
    myVideo = document.getElementById('myVideo');
    myVideoWrap = document.getElementById('myVideoWrap');
    myVideoAvatarImage = document.getElementById('myVideoAvatarImage');
    myAudioStatusIcon = document.getElementById('myAudioStatusIcon');
}

function thereIsPeerConnections() {
    if (Object.keys(peerConnections).length === 0) return false;
    return true;
}

function initClient() {
    console.log('RoomURL', roomURL);
    console.log('Location', window.location);

    isWebRTCSupported = IsSupportedWebRTC();
    if (!isWebRTCSupported) {
        return alert('This browser seems not supported WebRTC!');
    }
    userAgent = navigator.userAgent.toLowerCase();
    isMobileDevice = isMobile(userAgent);
    isTabletDevice = isTablet(userAgent);
    isIPadDevice = isIpad(userAgent);
    isDesktopDevice = isDesktop();

    console.log('Connecting to signaling server');
    signalingSocket = io({ transports: ['websocket'] });

    signalingSocket.on('connect', handleConnect);
    signalingSocket.on('serverInfo', handleServerInfo);
    signalingSocket.on('addPeer', handleAddPeer);
    signalingSocket.on('sessionDescription', handleSessionDescription);
    signalingSocket.on('iceCandidate', handleIceCandidate);
    signalingSocket.on('peerStatus', handlePeerStatus);
    signalingSocket.on('disconnect', handleDisconnect);
    signalingSocket.on('removePeer', handleRemovePeer);
}

async function sendToServer(msg, config = {}) {
    await signalingSocket.emit(msg, config);
}

function handleConnect() {
    console.log('Connected to signaling server');
    thisPeerId = signalingSocket.id;
    console.log('This peer id: ' + thisPeerId);
    if (localMediaStream) {
        joinToChannel();
    } else {
        setupLocalMedia(() => {
            getDocumentElementsById();
            handleEvents();
            showWaitingUser();
            joinToChannel();
        });
    }
}

function joinToChannel() {
    console.log('Join to channel', roomId);
    sendToServer('join', {
        channel: roomId,
        peerInfo: {
            peerName: peerName,
            peerVideo: isVideoStreaming,
            peerAudio: isAudioStreaming,
            peerScreen: isScreenStreaming,
        },
        peerDevice: {
            userAgent: userAgent,
            isWebRTCSupported: isWebRTCSupported,
            isMobileDevice: isMobileDevice,
            isTabletDevice: isTabletDevice,
            isIPadDevice: isIPadDevice,
            isDesktopDevice: isDesktopDevice,
        },
    });
    playSound('join');
}

function handleServerInfo(config) {
    roomPeersCount = config.roomPeersCount;
}

function handleAddPeer(config) {
    if (roomPeersCount > 2) {
        return roomIsBusy();
    }

    const peerId = config.peerId;
    const peers = config.peers;
    const shouldCreateOffer = config.shouldCreateOffer;
    const iceServers = config.iceServers;

    if (peerId in peerConnections) {
        return console.warn('Peer already connected', peerId);
    }

    buttonsBar.style.display = 'block';

    peerConnection = new RTCPeerConnection({ iceServers: iceServers });
    peerConnections[peerId] = peerConnection;

    handlePeersConnectionStatus(peerId);
    handleOnIceCandidate(peerId);
    handleRTCDataChannels(peerId);
    handleOnTrack(peerId, peers);
    handleAddTracks(peerId);

    if (shouldCreateOffer) {
        handleRtcOffer(peerId);
    }
    if (thereIsPeerConnections()) {
        waitingDivContainer.style.display = 'none';
    }
    handleBodyEvents();
    playSound('join');
}

function roomIsBusy() {
    signalingSocket.disconnect();
    console.log('Room busy disconnect');
    alert(`This room ${roomId} is busy, try with another one`);
    openURL('/');
}

function handlePeersConnectionStatus(peerId) {
    peerConnections[peerId].onconnectionstatechange = function (event) {
        const connectionStatus = event.currentTarget.connectionState;
        console.log('Connection', { peerId: peerId, connectionStatus: connectionStatus });
    };
}

function handleOnIceCandidate(peerId) {
    peerConnections[peerId].onicecandidate = (event) => {
        if (!event.candidate) return;
        sendToServer('relayICE', {
            peerId: peerId,
            iceCandidate: {
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                candidate: event.candidate.candidate,
            },
        });
    };
}

async function handleRTCDataChannels(peerId) {
    peerConnections[peerId].ondatachannel = (event) => {
        console.log('Datachannel event peerId: ' + peerId, event);
        event.channel.onmessage = (msg) => {
            let config = {};
            try {
                config = JSON.parse(msg.data);
                handleIncomingDataChannelMessage(config);
            } catch (err) {
                console.log('Datachannel error', err);
            }
        };
    };
    dataChannels[peerId] = peerConnections[peerId].createDataChannel('mt_c2c_dc');
    dataChannels[peerId].onopen = (event) => {
        console.log('DataChannels created for peerId: ' + peerId, event);
    };
}

function handleOnTrack(peerId, peers) {
    peerConnections[peerId].ontrack = (event) => {
        console.log('Handle on track event', event);
        if (event.track.kind === 'video') {
            setRemoteMedia(event.streams[0], peers, peerId);
        }
    };
}

function handleAddTracks(peerId) {
    localMediaStream.getTracks().forEach((track) => {
        peerConnections[peerId].addTrack(track, localMediaStream);
    });
}

function handleRtcOffer(peerId) {
    peerConnections[peerId].onnegotiationneeded = () => {
        console.log('Creating RTC offer to', peerId);
        peerConnections[peerId]
            .createOffer()
            .then((localDescription) => {
                console.log('Local offer description is', localDescription);
                peerConnections[peerId]
                    .setLocalDescription(localDescription)
                    .then(() => {
                        sendToServer('relaySDP', {
                            peerId: peerId,
                            sessionDescription: localDescription,
                        });
                        console.log('Offer setLocalDescription done!');
                    })
                    .catch((err) => {
                        console.error('[Error] offer setLocalDescription', err);
                    });
            })
            .catch((err) => {
                console.error('[Error] sending offer', err);
            });
    };
}

function handleSessionDescription(config) {
    console.log('Remote Session Description', config);
    const peerId = config.peerId;
    const remoteDescription = config.sessionDescription;
    const description = new RTCSessionDescription(remoteDescription);
    peerConnections[peerId]
        .setRemoteDescription(description)
        .then(() => {
            console.log('Set remote description done!');
            if (remoteDescription.type == 'offer') {
                console.log('Creating answer');
                peerConnections[peerId]
                    .createAnswer()
                    .then((localDescription) => {
                        console.log('Answer description is: ', localDescription);
                        peerConnections[peerId]
                            .setLocalDescription(localDescription)
                            .then(() => {
                                sendToServer('relaySDP', {
                                    peerId: peerId,
                                    sessionDescription: localDescription,
                                });
                                console.log('Answer setLocalDescription done!');
                            })
                            .catch((err) => {
                                console.error('[Error] answer setLocalDescription', err);
                            });
                    })
                    .catch((err) => {
                        console.error('[Error] creating answer', err);
                    });
            }
        })
        .catch((err) => {
            console.error('[Error] setRemoteDescription', err);
        });
}

function handleIceCandidate(config) {
    const peerId = config.peerId;
    const iceCandidate = config.iceCandidate;
    peerConnections[peerId].addIceCandidate(new RTCIceCandidate(iceCandidate)).catch((err) => {
        console.error('[Error] addIceCandidate', err);
    });
}

function handleDisconnect() {
    console.log('Disconnected from signaling server');
    for (let peerId in peerMediaElements) {
        document.body.removeChild(peerMediaElements[peerId].parentNode);
    }
    for (let peerId in peerConnections) {
        peerConnections[peerId].close();
    }
    peerConnections = {};
    peerMediaElements = {};
    dataChannels = {};
}

function handleRemovePeer(config) {
    console.log('Signaling server said to remove peer:', config);
    const peerId = config.peerId;

    if (peerId in peerMediaElements) document.body.removeChild(peerMediaElements[peerId].parentNode);
    if (peerId in peerConnections) peerConnections[peerId].close();

    delete dataChannels[peerId];
    delete peerConnections[peerId];
    delete peerMediaElements[peerId];

    if (!thereIsPeerConnections()) {
        waitingDivContainer.style.display = 'block';
        buttonsBar.style.display = 'none';
        if (settings.classList.contains('show')) settings.classList.toggle('show');
    }

    console.log('Peers count: ' + Object.keys(peerConnections).length);
    playSound('leave');
}

function setupLocalMedia(callback, errorBack) {
    if (localMediaStream != null) {
        if (callback) callback();
        return;
    }
    console.log('Requesting access to local audio/video inputs');
    navigator.mediaDevices
        .getUserMedia({ audio: true, video: true })
        .then((stream) => {
            setLocalMedia(stream);
            if (callback) callback();
            navigator.mediaDevices.enumerateDevices().then((devices) => {
                videoDevices = devices.filter(
                    (device) => device.kind === 'videoinput' && device.deviceId !== 'default',
                );
                audioDevices = devices.filter(
                    (device) => device.kind === 'audioinput' && device.deviceId !== 'default',
                );
                console.log('Devices', {
                    audioDevices: audioDevices,
                    videoDevices: videoDevices,
                });
                audioDevices.forEach((device) => {
                    addChild(audioSource, device);
                });
                videoDevices.forEach((device) => {
                    addChild(videoSource, device);
                });
            });
        })
        .catch((err) => {
            console.error('[Error] access denied for audio/video', err);
            if (err.name == 'NotAllowedError')
                alert(
                    "Meet needs access to the camera and microphone. Click the locked camera and microphone icon in your browser's address bar, before to join room. \n\n" +
                        err.toString(),
                );
            if (errorBack) errorBack();
        });
}

function addChild(source, device) {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.text = device.label;
    source.appendChild(option);
}

function setLocalMedia(stream) {
    console.log('Access granted to audio/video');
    localMediaStream = stream;
    const myVideoWrap = document.createElement('div');
    const myLocalMedia = document.createElement('video');
    const myVideoHeader = document.createElement('div');
    const myVideoFooter = document.createElement('div');
    const myVideoPeerName = document.createElement('h4');
    const myFullScreenBtn = document.createElement('button');
    const myAudioStatusIcon = document.createElement('button');
    const myVideoAvatarImage = document.createElement('img');
    myFullScreenBtn.id = 'myFullScreen';
    myFullScreenBtn.className = className.fullScreenOn;
    myVideoHeader.id = 'myVideoHeader';
    myVideoHeader.className = 'videoHeader fadeIn';
    myVideoFooter.id = 'myVideoFooter';
    myVideoFooter.className = 'videoFooter';
    myVideoPeerName.id = 'myVideoPeerName';
    myVideoPeerName.innerHTML = peerName + ' (me)';
    myAudioStatusIcon.id = 'myAudioStatusIcon';
    myAudioStatusIcon.className = className.audioOn;
    myVideoAvatarImage.id = 'myVideoAvatarImage';
    myVideoAvatarImage.setAttribute('src', camOffImg);
    myVideoAvatarImage.className = 'videoAvatarImage pulsate';
    myVideoHeader.appendChild(myFullScreenBtn);
    myVideoHeader.appendChild(myAudioStatusIcon);
    myVideoFooter.appendChild(myVideoPeerName);
    myLocalMedia.id = 'myVideo';
    myLocalMedia.className = 'mirror';
    myLocalMedia.playsInline = true;
    myLocalMedia.autoplay = true;
    myLocalMedia.muted = true;
    myLocalMedia.volume = 0;
    myLocalMedia.controls = false;
    myVideoWrap.id = 'myVideoWrap';
    myVideoWrap.className = 'myVideoWrap fadeIn';
    myVideoWrap.appendChild(myVideoHeader);
    myVideoWrap.appendChild(myVideoFooter);
    myVideoWrap.appendChild(myVideoAvatarImage);
    myVideoWrap.appendChild(myLocalMedia);
    document.body.appendChild(myVideoWrap);
    logStreamSettingsInfo('localMediaStream', localMediaStream);
    attachMediaStream(myLocalMedia, localMediaStream);
    handleFullScreen(myFullScreenBtn, myVideoWrap, myLocalMedia);
}

function setRemoteMedia(stream, peers, peerId) {
    remoteMediaStream = stream;
    const peerName = peers[peerId]['peerName'];
    const peerVideo = peers[peerId]['peerVideo'];
    const peerAudio = peers[peerId]['peerAudio'];
    const peerScreen = peers[peerId]['peerScreen'];
    const remoteVideoWrap = document.createElement('div');
    const remoteMedia = document.createElement('video');
    const remoteVideoHeader = document.createElement('div');
    const remoteVideoFooter = document.createElement('div');
    const remoteVideoPeerName = document.createElement('h4');
    const remoteFullScreenBtn = document.createElement('button');
    const remoteAudioStatusIcon = document.createElement('button');
    const remoteVideoAvatarImage = document.createElement('img');
    remoteVideoHeader.id = peerId + '_remoteVideoHeader';
    remoteVideoHeader.className = 'videoHeader fadeIn';
    remoteVideoFooter.id = peerId + '_remoteVideoFooter';
    remoteVideoFooter.className = 'remoteVideoFooter';
    remoteVideoPeerName.id = peerId + '_remotePeerName';
    remoteVideoPeerName.innerHTML = peerName;
    remoteFullScreenBtn.id = peerId + '_remoteFullScreen';
    remoteFullScreenBtn.className = className.fullScreenOn;
    remoteAudioStatusIcon.id = peerId + '_remoteAudioStatus';
    remoteAudioStatusIcon.className = className.audioOn;
    remoteVideoAvatarImage.id = peerId + '_remoteVideoAvatar';
    remoteVideoAvatarImage.src = camOffImg;
    remoteVideoAvatarImage.className = 'videoAvatarImage pulsate';
    remoteVideoHeader.appendChild(remoteFullScreenBtn);
    remoteVideoHeader.appendChild(remoteAudioStatusIcon);
    remoteVideoFooter.appendChild(remoteVideoPeerName);
    remoteMedia.id = peerId + '_remoteVideo';
    remoteMedia.playsInline = true;
    remoteMedia.autoplay = true;
    remoteMedia.controls = false;
    if (peerVideo && peerScreen) remoteMedia.style.objectFit = 'contain';
    peerMediaElements[peerId] = remoteMedia;
    remoteVideoWrap.id = peerId + '_remoteVideoWrap';
    remoteVideoWrap.className = 'remoteVideoWrap';
    remoteVideoWrap.appendChild(remoteVideoHeader);
    remoteVideoWrap.appendChild(remoteVideoFooter);
    remoteVideoWrap.appendChild(remoteVideoAvatarImage);
    remoteVideoWrap.appendChild(remoteMedia);
    document.body.appendChild(remoteVideoWrap);
    attachMediaStream(remoteMedia, remoteMediaStream);
    handleFullScreen(remoteFullScreenBtn, remoteVideoWrap, remoteMedia);
    setPeerVideoStatus(peerId, peerVideo);
    setPeerAudioStatus(peerId, peerAudio);
    if (isMobileDevice && !isTabletDevice && !isIPadDevice) {
        document.documentElement.style.setProperty('--my-video-wrap-width', '190px');
        document.documentElement.style.setProperty('--my-video-wrap-height', '150px');
    }
}

function handleIncomingDataChannelMessage(config) {
    switch (config.type) {
        case 'chat':
            handleMessage(config);
            break;
        default:
            break;
    }
}

function handleEvents() {
    homeBtn.onclick = () => {
        openURL('/');
    };
    if (navigator.share) {
        shareRoomBtn.onclick = () => {
            shareRoom();
        };
    } else {
        shareRoomBtn.style.display = 'none';
        copyRoomBtn.style.display = 'inline';
        copyRoomBtn.onclick = () => {
            copyRoom();
        };
    }
    initHideMeBtn.onclick = () => {
        toggleHideMe();
    };
    initAudioBtn.onclick = (e) => {
        setAudioStatus(!localMediaStream.getAudioTracks()[0].enabled, e);
    };
    initVideoBtn.onclick = (e) => {
        setVideoStatus(!localMediaStream.getVideoTracks()[0].enabled, e);
    };
    hideMeBtn.onclick = () => {
        toggleHideMe();
    };
    audioBtn.onclick = (e) => {
        setAudioStatus(!localMediaStream.getAudioTracks()[0].enabled, e);
    };
    videoBtn.onclick = (e) => {
        setVideoStatus(!localMediaStream.getVideoTracks()[0].enabled, e);
    };
    if (!isMobileDevice && (navigator.getDisplayMedia || navigator.mediaDevices.getDisplayMedia)) {
        screenShareBtn.onclick = async () => {
            await toggleScreenSharing();
        };
    } else {
        screenShareBtn.style.display = 'none';
    }
    navigator.mediaDevices.enumerateDevices().then((devices) => {
        const videoInput = devices.filter((device) => device.kind === 'videoinput');
        if (videoInput.length > 1 && isMobileDevice) {
            swapCameraBtn.onclick = () => {
                swapCamera();
            };
        } else {
            swapCameraBtn.style.display = 'none';
        }
    });
    if (isDesktopDevice) {
        settingsBtn.onclick = () => {
            settings.classList.toggle('show');
        };
        settingsCloseBtn.onclick = () => {
            settings.classList.toggle('show');
        };
    } else {
        settingsBtn.style.display = 'none';
    }
    sendMsgBtn.onclick = () => {
        sendMessage();
    };
    audioSource.onchange = (e) => {
        changeMicrophone(e.target.value);
    };
    videoSource.onchange = (e) => {
        changeCamera(e.target.value);
    };
    endCallBtn.onclick = () => {
        endCall();
    };
}

function showWaitingUser() {
    loadingDivContainer.style.display = 'none';
    waitingDivContainer.style.display = 'block';
}

function toggleHideMe() {
    const isVideoWrapHidden = myVideoWrap.style.display == 'none';
    hideMeBtn.className = isVideoWrapHidden ? className.user : className.userOff;
    initHideMeBtn.className = isVideoWrapHidden ? className.user : className.userOff;
    myVideoWrap.style.display = isVideoWrapHidden ? 'block' : 'none';
}

function swapCamera() {
    camera = camera == 'user' ? 'environment' : 'user';
    const camVideo = camera == 'user' ? true : { facingMode: { exact: camera } };
    navigator.mediaDevices
        .getUserMedia({ video: camVideo })
        .then((camStream) => {
            localMediaStream.getVideoTracks()[0].stop();
            refreshMyLocalVideoStream(camStream);
            refreshMyVideoStreamToPeers(camStream);
            setVideoStatus(true);
            if (!isCamMirrored) {
                myVideo.classList.toggle('mirror');
                isCamMirrored = true;
            }
        })
        .catch((err) => {
            console.error('[Error] to swapping camera', err);
            alert('Error to swapping the camera ' + err.toString());
        });
}

async function toggleScreenSharing() {
    const constraints = {
        audio: false,
        video: true,
    };
    let screenMediaPromise = null;
    try {
        screenMediaPromise = isScreenStreaming
            ? await navigator.mediaDevices.getUserMedia({ video: true })
            : await navigator.mediaDevices.getDisplayMedia(constraints);
        if (screenMediaPromise) {
            localMediaStream.getVideoTracks()[0].stop();
            isScreenStreaming = !isScreenStreaming;
            refreshMyLocalVideoStream(screenMediaPromise);
            refreshMyVideoStreamToPeers(screenMediaPromise);
            setVideoStatus(isScreenStreaming, false, 'screen');
            myVideo.classList.toggle('mirror');
            myVideo.style.objectFit = isScreenStreaming ? 'contain' : 'cover';
            screenShareBtn.className = isScreenStreaming ? className.screenOff : className.screenOn;
        }
    } catch (err) {
        console.error('[Error] unable to share the screen', err);
        alert('Unable to share the screen ' + err.toString());
    }
}

function changeCamera(deviceId) {
    navigator.mediaDevices
        .getUserMedia({ video: { deviceId: deviceId } })
        .then((camStream) => {
            localMediaStream.getVideoTracks()[0].stop();
            refreshMyLocalVideoStream(camStream);
            refreshMyVideoStreamToPeers(camStream);
            setVideoStatus(true);
        })
        .catch((err) => {
            console.error('[Error] changeCamera', err);
            alert('Error while swapping camera' + err.tostring());
        });
}

function changeMicrophone(deviceId) {
    navigator.mediaDevices
        .getUserMedia({ audio: { deviceId: deviceId } })
        .then((micStream) => {
            localMediaStream.getAudioTracks()[0].stop();
            refreshMyLocalAudioStream(micStream);
            refreshMyLocalAudioStreamToPeers(micStream);
            setAudioStatus(true);
        })
        .catch((err) => {
            console.error('[Error] changeMicrophone', err);
            alert('Error while swapping microphone' + err.toString());
        });
}

function endCall() {
    signalingSocket.disconnect();
    openURL('/');
}

function attachMediaStream(element, stream) {
    element.srcObject = stream;
    console.log('Success, media stream attached');
}

function logStreamSettingsInfo(name, stream) {
    console.log(name, {
        video: {
            label: stream.getVideoTracks()[0].label,
            settings: stream.getVideoTracks()[0].getSettings(),
        },
        audio: {
            label: stream.getAudioTracks()[0].label,
            settings: stream.getAudioTracks()[0].getSettings(),
        },
    });
}

function setAudioStatus(active = true, e = false) {
    isAudioStreaming = active;
    localMediaStream.getAudioTracks()[0].enabled = active;
    if (e) e.target.className = isAudioStreaming ? className.audioOn : className.audioOff;
    myAudioStatusIcon.className = active ? className.audioOn : className.audioOff;
    audioBtn.className = isAudioStreaming ? className.audioOn : className.audioOff;
    initAudioBtn.className = isAudioStreaming ? className.audioOn : className.audioOff;
    emitPeerStatus('audio', active);
}

function setVideoStatus(active = true, e = false, type = 'video') {
    isVideoStreaming = active;
    localMediaStream.getVideoTracks()[0].enabled = active;
    if (e) e.target.className = isVideoStreaming ? className.videoOn : className.videoOff;
    videoBtn.className = isVideoStreaming ? className.videoOn : className.videoOff;
    initVideoBtn.className = isVideoStreaming ? className.videoOn : className.videoOff;
    myVideoAvatarImage.style.display = active ? 'none' : 'block';
    emitPeerStatus(type, active);
}

function refreshMyLocalVideoStream(stream) {
    stream.getVideoTracks()[0].enabled = true;
    const newStream = new MediaStream([stream.getVideoTracks()[0], localMediaStream.getAudioTracks()[0]]);
    localMediaStream = newStream;
    attachMediaStream(myVideo, localMediaStream);
    logStreamSettingsInfo('refreshMyLocalVideoStream', localMediaStream);
}

function refreshMyVideoStreamToPeers(stream) {
    if (!thereIsPeerConnections()) return;
    for (let peerId in peerConnections) {
        let videoSender = peerConnections[peerId]
            .getSenders()
            .find((s) => (s.track ? s.track.kind === 'video' : false));
        videoSender.replaceTrack(stream.getVideoTracks()[0]);
    }
}

function refreshMyLocalAudioStream(stream) {
    stream.getAudioTracks()[0].enabled = true;
    const newStream = new MediaStream([localMediaStream.getVideoTracks()[0], stream.getAudioTracks()[0]]);
    localMediaStream = newStream;
    attachMediaStream(myVideo, localMediaStream);
    logStreamSettingsInfo('refreshMyLocalAudioStream', localMediaStream);
}

function refreshMyLocalAudioStreamToPeers(stream) {
    if (!thereIsPeerConnections()) return;
    for (let peerId in peerConnections) {
        let audioSender = peerConnections[peerId]
            .getSenders()
            .find((s) => (s.track ? s.track.kind === 'audio' : false));
        audioSender.replaceTrack(stream.getAudioTracks()[0]);
    }
}

function handleFullScreen(fullScreenBtn, videoWrap, videoMedia) {
    fullScreenBtn.onclick = () => {
        if (isFullScreen()) {
            goOutFullscreen();
            fullScreenBtn.className = className.fullScreenOn;
        } else {
            goInFullscreen(videoWrap);
            fullScreenBtn.className = className.fullScreenOff;
        }
    };
    videoMedia.onclick = () => {
        if (isDesktopDevice) fullScreenBtn.click();
    };
}

function sendMessage() {
    Swal.fire({
        position: 'center',
        background: swal.background,
        color: swal.textColor,
        input: 'textarea',
        inputLabel: 'Send Message',
        inputPlaceholder: 'Type your message here...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showDenyButton: true,
        confirmButtonText: `Send`,
        denyButtonText: `Close`,
    }).then((result) => {
        if (result.isConfirmed) emitDcMsg(result.value);
    });
}

function handleMessage(config) {
    playSound('message');
    console.log('Receive msg: ' + config.msg);
    Swal.fire({
        position: 'center',
        background: swal.background,
        color: swal.textColor,
        icon: 'info',
        input: 'textarea',
        inputLabel: `New message from ${config.peerName}`,
        inputValue: config.msg,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showDenyButton: true,
        confirmButtonText: `Reply`,
        denyButtonText: `Close`,
    }).then((result) => {
        if (result.isConfirmed) emitDcMsg(result.value);
    });
}

function emitDcMsg(msg) {
    if (msg) {
        console.log('Send msg: ' + msg);
        Object.keys(dataChannels).map((peerId) =>
            dataChannels[peerId].send(
                JSON.stringify({
                    type: 'chat',
                    roomId: roomId,
                    peerName: peerName,
                    msg: msg,
                }),
            ),
        );
    }
}

function emitPeerStatus(element, active) {
    sendToServer('peerStatus', {
        roomId: roomId,
        peerName: peerName,
        element: element,
        active: active,
    });
}

function handlePeerStatus(config) {
    const element = config.element;
    const peerId = config.peerId;
    const active = config.active;

    switch (element) {
        case 'video':
            setPeerVideoStatus(peerId, active);
            break;
        case 'audio':
            setPeerAudioStatus(peerId, active);
            break;
        case 'screen':
            setPeerScreenStatus(peerId, active);
            break;
    }
}

function setPeerVideoStatus(peerId, active) {
    const peerVideoAvatarImage = document.getElementById(peerId + '_remoteVideoAvatar');
    peerVideoAvatarImage.style.display = active ? 'none' : 'block';
}

function setPeerAudioStatus(peerId, active) {
    const peerAudioStatus = document.getElementById(peerId + '_remoteAudioStatus');
    peerAudioStatus.className = active ? className.audioOn : className.audioOff;
}

function setPeerScreenStatus(peerId, active) {
    const remoteVideo = document.getElementById(peerId + '_remoteVideo');
    const remoteVideoAvatarImage = document.getElementById(peerId + '_remoteVideoAvatar');
    remoteVideo.style.objectFit = active ? 'contain' : 'cover';
    remoteVideoAvatarImage.style.display = active ? 'none' : 'block';
}
