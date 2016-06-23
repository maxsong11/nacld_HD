// Copyright 2015 Intel Corporation. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

"use strict";

var kMinMajor = 46;
var kMinMinor = 0;
var kMinBuild = 2472;

var logBlock = null;
var kMaxLogMessageLength = 20;
var logMessageArray = [];
var logMessage = logMessageLimit;
var is_sharing_ = false;
var shareMode = null;
var sharer_ = null;
var streamTrack_ = null;

var moduleWidth = null;
var moduleHeight = null;

var streamPasscode = null;
var streamIp = null;
var streamtitle=null;
var streamBitrate = null;
var streamFps = null;
var streamSharer = null;
var shareType = null;
var streamList = document.getElementById("streamList");
var streamItem = null;
var streamItemIp=null;
var currentlyStreaming=[];
var avaliableIpAddresses = ['239.255.42.99','239.255.42.98','239.255.42.97','239.255.42.96','239.255.42.95'];

var passcodeInputBox = document.getElementById('b1');
var streamtitleInputBox = document.getElementById('streamTitleInput');
var sharerNameInputBox = document.getElementById('sn');
var confirmPasscodeButton =document.getElementById('setPasscode');
var id = null;

navigator.getUserMedia = navigator.getUserMedia ||
  navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

function getOptions() {
    var ip = document.getElementById('ipinput').value;
    var port = document.getElementById('port').value;
    var bitrate = document.getElementById('bitrate').value;
    var fps = document.getElementById('fps').value;

    return {
      ip: ip,
      port: port,
      bitrate: bitrate,
      fps: fps,
    }
}

function saveOptions(options) {
    chrome.storage.local.set(options);
}

function loadOptions(cb) {
    chrome.storage.local.get(['ip', 'bitrate', 'fps', 'port'],
                             function(options) {
        cb(options);
    });
}

function desktopShare(cbStarted) {
    chrome.desktopCapture.chooseDesktopMedia(["screen", "window"], function (streamId) {
        if (!streamId) {
            localLog(2, "couldn't get capture stream.");
            return;
        }

        var constraints = {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: streamId,
                    maxWidth: 4096,
                    maxHeight: 4096
                }
            }
        };

        navigator.getUserMedia(constraints, function(captureStream) {
          cbStarted(captureStream);

          is_sharing_ = true;
        }, function(error) {
            localLog(2, error.name + ": " + error.message);
        });
    });
}

function cameraShare(cbStarted) {
  var constraints = {
    video: {
      mandatory: {
        maxWidth: 4096,
        maxHeight: 4096
      }
    }
  };

  navigator.getUserMedia(constraints, function(captureStream) {
    cbStarted(captureStream);

    is_sharing_ = true;
  }, function(error) {
    localLog(2, error.name + ": " + error.message);
  });
}

function captureStartLocal(type) {
  shareMode = type;
  if (streamTrack_ === null) {
    startCapture(sharer_);
    return;
  }

  sharer_.stop().then(function() {
    startCapture(sharer_);
  });
}

function startSharerCommon(type) {
  if (sharer_ !== null) {
    captureStartLocal(type);
    return;
  }

  var options = getOptions();
  saveOptions(options);

  nms.createSharer(options).then(function(sharer) {
    
    localLog(0, "Created sharer: " + sharer.sharer_id);
    sharer_ = sharer;
    captureStartLocal(type);
    
     
  }).catch(function(lastError) {
    localLog(2, "Could not create sharer: " + lastError);
  });
}

function showPasscodeInputBox() {
  passcodeInputBox.style.display='block';
  streamtitleInputBox.style.display='block';
  confirmPasscodeButton.style.display='block';
  sharerNameInputBox.style.display='block';
  passcodeInputBox.readonly=false;
  streamtitleInputBox.readonly=false;
  sharerNameInputBox.readonly=false;
  passcodeInputBox.setAttribute("label","Please enter a Passcode：");

}
function hidePasscodeInputBox() {
  document.getElementById('b1').style.display='none';
  document.getElementById('streamTitleInput').style.display='none';
  document.getElementById('setPasscode').style.display='none';
  sharerNameInputBox.style.display='none';
}

function startSharerDesktop() {
  showPasscodeInputBox();
  shareType = 'desktop';
  confirmPasscodeButton.disabled=false;
 
}

function startSharerCamera() {
  showPasscodeInputBox();
  shareType = 'camera';
  confirmPasscodeButton.disabled=false;
}

function startCapture(sharer) {
  var shareFunc;
  if (shareMode == "desktop")
    shareFunc = desktopShare;
  else if (shareMode == "camera")
    shareFunc = cameraShare;
  else {
    localLog(2, "ERROR: Can't share find which mode to share: " + mode);
    return;
  }

  shareFunc(function(captureStream) {
    var track = captureStream.getVideoTracks()[0];
    streamTrack_ = track;
    localLog(0, "Starting stream.");
    console.log(sharer);

    sharer.shareTracks(captureStream).then(function() {
      localLog(0, "Finally started streaming.");
      document.getElementById('stopSharing').disabled = false;
      return sharer.onStopped(); // Returns a promise that resolves when the
                                 // stream is stopped
    }).then(function() {
      is_sharing_ = false;
      streamTrack_ = null;
      document.getElementById('stopSharing').disabled = true;
      localLog(0, "Finished sharing stream.");
    });
  });
}

function stopSharer() {
  if (sharer_ !== null) {
    localLog(0, "Stopping stream.");
    sharer_.stop().then(function() {
      localLog(0, "Finally stopped stream.");
    });
  }
  hidePasscodeInputBox();
  rtm({
    type: 'remove-stream',
    streamIp: document.getElementById('ipinput').value
  });
}

function fullscreenHandler() {
  var elm = document.webkitFullscreenElement;

  if (elm == null) {
    // returning from fullscreen, restore size
    var moduleEl = document.getElementById('nacl_module');
    localLog(1, "Reloading module size: " + moduleWidth + "x" + moduleHeight);
    moduleEl.setAttribute('width', moduleWidth);
    moduleEl.setAttribute('height', moduleHeight);
  }
}

function setFullscreen() {
console.log('clickedfullscreen');
  var moduleEl = document.getElementById('nacl_module');
  if (!moduleEl) {
    localLog(2, "Failed to go fullscreen: can't find nacl module element.");
    return;
  }

  // Save current size before going to fullscreen
  moduleWidth = moduleEl.getAttribute('width');
  moduleHeight = moduleEl.getAttribute('height');
  localLog(1, "Saving module size: " + moduleWidth + "x" + moduleHeight);

  var newWidth = window.screen.width;
  var newHeight = window.screen.height;
  moduleEl.setAttribute('width', newWidth);
  moduleEl.setAttribute('height', newHeight);

  moduleEl.webkitRequestFullScreen();

  document.addEventListener("webkitfullscreenchange", fullscreenHandler);
}

function moduleDidLoad() {
    
    document.getElementById('startSharing').onclick = startSharerDesktop;
    document.getElementById('startCamSharing').onclick = startSharerCamera;
    document.getElementById('stopSharing').onclick = stopSharer;
    document.getElementById('stopSharing').disabled = true;

    document.getElementById('bitrate').oninput = bitRateChangedText;
    document.getElementById('bitrate').onchange = bitRateChanged;
    document.getElementById('fps').oninput = fpsChangedText;
    document.getElementById('fps').onchange = fpsChanged;
    document.getElementById('localhost').onchange = localhostChanged;

    document.getElementById('playStream').onclick = startPlay;
    document.getElementById('full').onclick = setFullscreen;

    document.getElementById('setPasscode').onclick = setPasscode;
    document.getElementById('playStream').disabled=true;
    checkVersion();
}


function stopStreamReceiver() {
  localLog(2, "STOP....");
  nms.stopPlayer().then(function() {
    document.getElementById('playStream').innerText = 'Play stream';
    document.getElementById('playStream').onclick = startPlay;
    document.getElementById('passcodeInput').setAttribute("label","StreamCode: ");
    document.getElementById('streamList').style.display="block";
    document.getElementById('playStream').disabled=true;
    // Resize the NaCl module to a minimum size so that it doesn't take too much
    // space
    var moduleEl = document.getElementById('nacl_module');
    moduleEl.setAttribute('width', 1);
    moduleEl.setAttribute('height', 1);
  });
}

function logDocumentSet(doc, func) {
  logBlock = doc.getElementById('log');
  logMessage = func;
}

function logMessageLimit(message) {
  logMessageArray.push(message.log);
  if (logMessageArray.length > kMaxLogMessageLength)
    logMessageArray.shift();

  if (logBlock) {
    logBlock.textContent = logMessageArray.join('\n');
  }
}

function logMessageAppend(message) {
  var span = document.createElement("span");
  span.innerText = message.log + '\n';

  if (message.level == 0) {
    span.className = "loginfo";
  } else if (message.level == 1) {
    span.className = "logwarning";
  } else if (message.level == 2) {
    span.className = "logerror";
  }

  logBlock.appendChild(span);
  logBlock.scrollTop = logBlock.scrollHeight;
}

function localLog(level, msg) {
  var logmsg = {
    level: level,
    log: msg
  };
  logMessage(logmsg);
}

function bitRateChanged() {
    var bitrate = document.getElementById('bitrate').value;
    var bitratevalue = document.getElementById('bitratevalue');
    bitratevalue.innerHTML = bitrate + " kbps";

    if (is_sharing_) { /* Change parameters on runtime */
      var options = getOptions();
      saveOptions(options);
      sharer_.changeEncoding(options);
    }
}

function fpsChanged() {
    var fps = document.getElementById('fps').value;
    var fpsvalue = document.getElementById('fpsvalue');
    fpsvalue.innerHTML = fps;
}

function bitRateChangedText() {
    var bitrate = document.getElementById('bitrate').value;
    var bitratevalue = document.getElementById('bitratevalue');
    bitratevalue.innerHTML = bitrate + " kbps";
}

function fpsChangedText() {
    var fps = document.getElementById('fps').value;
    var fpsvalue = document.getElementById('fpsvalue');
    fpsvalue.innerHTML = fps;
}


function localhostChanged() {
    var localhost = document.getElementById('localhost').checked;
    var ip = document.getElementById('ipinput');
    if (localhost) {
        ip.disabled = true;
        ip.value = '127.0.0.1';
    } else {
        ip.disabled = false;
    }
}

function startPlay() {
  var passcodelocal = document.getElementById('passcodeInput').value;
  var portlocal = document.getElementById('port').value;
  var bitratelocal = currentlyStreaming[currentlyStreaming.indexOf(passcodelocal)-2];
  var fpslocal = currentlyStreaming[currentlyStreaming.indexOf(passcodelocal)-3];
  var iplocal = currentlyStreaming[currentlyStreaming.indexOf(passcodelocal)-1];
  if(streamPasscode == passcodelocal){
    var options = {
      ip: iplocal,
      port: portlocal,
      bitrate: bitratelocal,
      fps: fpslocal
    }
    saveOptions(options);
    console.log(options);
    nms.startPlayer(options).then(function() {
      document.getElementById('playStream').innerText = 'Stop stream';
      document.getElementById('playStream').onclick = stopStreamReceiver;
      document.getElementById('passcodeInput').setAttribute("label","Correct! Streaming now...");
      document.getElementById('streamList').style.display="none";
      document.getElementById('passcodeInput').value='';
    });
    // Resize the NaCl module when stream playing is started
    var moduleEl = document.getElementById('nacl_module');
    moduleEl.setAttribute('width', 640);
    moduleEl.setAttribute('height', 340);
    
  }
  else{
    document.getElementById('passcodeInput').setAttribute("label","Wrong passcode, re-enter Please");
  }
}

function detachLog() {
  chrome.runtime.getBackgroundPage(function(bg) {
    bg.createLogWindow(
      function(dom) {
        logDocumentSet(dom, logMessageAppend);
      },
      function() {
        logDocumentSet(document, logMessageLimit);
        console.log('INFO: log window closed.');
      }
    );
  });
}

function customlog(msg) {
  localLog(0, msg);
}

function checkVersion() {
  chrome.runtime.getPlatformInfo(function(platformInfo) {
    // If the app is running on ChromeOS, check if the browser version is at
    // least 46.0.2472.0
    if (platformInfo.os.toString() == "cros") {
      // The user agent will contain a string in the form of "Chrome/A.B.C.D",
      // where A, B, C, D are numbers
      var browserVersion = navigator.userAgent
                      .match(/Chrome\/([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)/);

      var major = parseInt(browserVersion[1], 10);
      var minor = parseInt(browserVersion[2], 10);
      var build = parseInt(browserVersion[3], 10);

      if ((major < kMinMajor) ||
          (major == kMinMajor && minor < kMinMinor) ||
          (major == kMinMajor && minor == kMinMinor && build < kMinBuild)) {
        chrome.app.window.create('version_popup.html', {
          id: "version_popup",
          width: 300,
          height: 200
        });
      }
    }
  });
}

window.onload = function() {
    logDocumentSet(document, logMessageLimit);
}

document.addEventListener('DOMContentLoaded', function() {
  var loadpromise = nms.loadModule(window, document.body, customlog);

  loadpromise.then(function() {
    moduleDidLoad();
  }).catch(function(lastError) {
    customlog('Error when loading module: ' + lastError);
  });
});



//===============================================multocast-part============================================




function rtm(message, callback) {
  if (callback) {
    chrome.runtime.sendMessage(chrome.runtime.id, message, callback);
  } else {
    chrome.runtime.sendMessage(chrome.runtime.id, message);
  }
}

function setClientId(name, callback) {
  chrome.runtime.sendMessage(chrome.runtime.id, {
    type: "set-client-id",
    value: name
  }, callback);
}

function startEditClientId() {
  var clientIdBox = document.getElementById('client-id');

  setTimeout(function () {
    clientIdBox.setAttribute('contenteditable', 'true');
    clientIdBox.focus();
    clientIdBox.onblur = function () {
      clientIdBox.onblur = null;
      clientIdBox.removeAttribute('contenteditable');
      setClientId(clientIdBox.textContent, function (name) {
        clientIdBox.textContent = name;
      });
    };
  }, 1);
}

// var knowUsers = new Collection();

// function refreshUserList() {
//   rtm({
//     type: 'query-users'
//   }, function (result) {
//     var names = Object.keys(result);
//     names.sort();
//     var userList = document.getElementById('user-list');
//     if (names.length == 0) {
//       userList.innerHTML = '<li>(No user found)</li>';
//     } else {
//       userList.innerHTML = '';
//       names.forEach(function (name) {
//         for (var ip in result[name]) {
//           var userItem = document.createElement('li');
//           userItem.textContent = '[' + name + ']';
//           userItem.title = "From: " + ip;
//           knowUsers.put(name + ' ' + ip, userItem);
//         }
//       });
//       knowUsers.sortByKeys();
//       knowUsers.forEach(function (value, key) {
//         userList.appendChild(value);
//       });
//     }
//   });
// }

// function removeUser(name, ip) {
//   var key = name + ' ' + ip;
//   var node = knowUsers.get(key);
//   if (node) {
//     node.parentNode.removeChild(node);
//     knowUsers.remove(key);
//   }
//   if (knowUsers.length == 0) {
//     document.getElementById('user-list').innerHTML = '<li>(No user found)</li>';
//   }
// }

// function addUser(name, ip) {
//   var key = name + ' ' + ip;
//   if (knowUsers.get(key)) {
//     return;
//   }
//   var userList = document.getElementById('user-list');
//   var userItem = document.createElement('li');
//   userItem.textContent = '[' + name + ']';
//   userItem.title = "From: " + ip;
//   var keys = knowUsers.keys();
//   if (keys.length == 0) {
//     userList.innerHTML = '';
//   }
//   for (var i = 0; i < keys.length; i++) {
//     if (keys[i] > key) {
//       break;
//     }
//   }
//   if (i < keys.length) {
//     userList.insertBefore(userItem, knowUsers.getByIndex(i));
//   } else {
//     userList.appendChild(userItem);
//   }
//   knowUsers.put(key, userItem);
// }

function setPasscode() {
  confirmPasscodeButton.disabled=true;
  var streamtitlelocal = streamtitleInputBox.value;
  var message = passcodeInputBox.value;
  var streamIplocal = document.getElementById('ipinput').value;
  var streamPortlocal = document.getElementById('port').value;
  var bitratelocal = document.getElementById('bitrate').value;
  var fpslocal = document.getElementById('fps').value;
  var sharerNamelocal = document.getElementById('sn').value;
  var foundAnEmptyIp=false;
  passcodeInputBox.setAttribute('readonly', '');
  streamtitleInputBox.setAttribute('readonly', '');
  sharerNameInputBox.setAttribute('readonly', '');

    if (currentlyStreaming.indexOf(streamIplocal)==-1){
        rtm({
              type: 'send-message',
              message: message,
              streamIp: streamIplocal,
              streamPort: streamPortlocal,
              title: streamtitlelocal,
              sharerName:sharerNamelocal,
              bitrate:bitratelocal,
              fps:fpslocal
            }, function () {
              passcodeInputBox.value = '';
            });
            startSharerCommon(shareType);
            document.getElementById("b1").setAttribute("label","Broadcasting......");
            document.getElementById('stopSharing').disabled = false;
            console.log('sent'+message);
            foundAnEmptyIp=true;
      }
    else{
      for (var i = 0; i < avaliableIpAddresses.length; i++) {
        if(currentlyStreaming.indexOf(avaliableIpAddresses[i]) == -1){
          streamIplocal=avaliableIpAddresses[i];
          document.getElementById('ipinput').value=avaliableIpAddresses[i];
          rtm({
            type: 'send-message',
            message: message,
            streamIp: streamIplocal,
            streamPort: streamPortlocal,
            title: streamtitlelocal,
            sharerName:sharerNamelocal,
            bitrate:bitratelocal,
            fps:fpslocal
          }, function () {
            passcodeInputBox.value = '';
          });
          startSharerCommon(shareType);
          document.getElementById("b1").setAttribute("label","Broadcasting......");
          document.getElementById('stopSharing').disabled = false;
          console.log('sent'+message);
          foundAnEmptyIp=true;
          break;
        }
      }
    }
  if (foundAnEmptyIp==false){
    //no empty ip slots on the network.
  }
}


// function init(clientId) {
//   var clientIdBox = document.getElementById('client-id');
//   clientIdBox.textContent = clientId;
//   clientIdBox.ondblclick = startEditClientId;
//   var messageInputBox = document.getElementById('input-box');
//   messageInputBox.addEventListener('keydown', function (e) {
//     if (e.keyCode == 13 && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
//       sendMessage();
//     }
//   });

  // var toggleHelp = document.getElementById('toggle-help');
  // toggleHelp.onclick = function () {
  //   var helpText = document.getElementById('help');
  //   helpText.classList.toggle('hide-help');
  // };

  // var closeBox = document.getElementById('close');
  // closeBox.onclick = function () {
  //   chrome.app.window.current().close();
  // };

//   var splitter = document.getElementById('splitter');
//   chrome.storage.local.get('input-panel-size', function (obj) {
//     if (obj['input-panel-size']) {
//       var inputPanel = document.getElementById('input-panel');
//       inputPanel.style.height = obj['input-panel-size'] + 1 + 'px';
//     }
//   });
//   splitter.onmousedown = function (e) {
//     if (e.button != 0) {
//       return;
//     }
//     e.stopPropagation();
//     e.preventDefault();
//     var inputPanel = document.getElementById('input-panel');
//     var totalHeight = document.body.scrollHeight;
//     var panelHeight = inputPanel.scrollHeight;
//     var startY = e.pageY;
//     var MouseMove;
//     document.addEventListener('mousemove', MouseMove = function (e) {
//       e.stopPropagation();
//       e.preventDefault();
//       var dy = e.pageY - startY;
//       if (panelHeight - dy < 120) {
//         dy = panelHeight - 120;
//       }
//       if (totalHeight - panelHeight + dy < 120) {
//         dy = 120 - totalHeight + panelHeight;
//       }
//       inputPanel.style.height = panelHeight - dy + 1 + 'px';
//       chrome.storage.local.set({'input-panel-size': panelHeight - dy});
//     });
//     document.addEventListener('mouseup', function MouseUp(e) {
//       MouseMove(e);
//       document.removeEventListener('mousemove', MouseMove);
//       document.removeEventListener('mouseup', MouseUp);
//     });
//   };
//   refreshUserList();
// }

function AddStream(){
  //add stream info to streamArray
  //add stream html to the screen
  streamItem = document.createElement("paper-card");
  streamItemIp = document.createElement('div');
  streamItemIp.setAttribute("class","card-content");
  streamItem.setAttribute('heading',streamtitle);
  streamItem.setAttribute('id',streamIp);
  streamItemIp.innerHTML+='<b>' + streamSharer + '</b>' + ' is sharing';
  streamItemIp.innerHTML+= '<br>'

  var cardActions = document.createElement('div');
  cardActions.setAttribute("class","card-actions");
  var streamid1="enterstream"+streamIp;
  var streamid2="advanced"+streamIp;
  cardActions.innerHTML+='<paper-button id ='+streamid1+'>' + 'Enter Stream' + '</paper-button>';
  cardActions.innerHTML+='<paper-button id ='+streamid2+'>' + 'Advanced information' + '</paper-button>';
  

  

  // var carActions=document.createElement('div');
  // carActions.setAttribute("class","card-actions");
  // var playStreamButton = document.createElement("paper-button")

  streamItem.appendChild(streamItemIp);
  streamItem.appendChild(cardActions);
  streamList.appendChild(streamItem);
  document.getElementById(streamid1).addEventListener('click', function(e) {
      streamPasscode=currentlyStreaming[currentlyStreaming.indexOf(streamIp)+1]
      document.getElementById('passcodeInput').setAttribute('label','Please enter passcode for stream  '+streamtitle+', then click the "play stream" button below');
      document.getElementById('playStream').disabled=false;
  });
  document.getElementById(streamid2).addEventListener('click', function(e) {
  streamItemIp.innerHTML+='<b>Bit Rate: </b>' + streamBitrate;
  streamItemIp.innerHTML+= '<br>'
  streamItemIp.innerHTML+='<b>FPS: </b>' + streamFps;
  streamItemIp.innerHTML+= '<br>'
  streamItemIp.innerHTML+='<b>IP Address: </b>' + streamIp;
  streamItemIp.innerHTML+= '<br>'
  streamItemIp.innerHTML+='<b>Stream Code: </b>' + streamPasscode;
  document.getElementById(streamid2).disabled=true;
  });
}
function RemoveStream(ip){
//remove stream html to the screen
  streamList.removeChild(document.getElementById(ip));
  currentlyStreaming.splice(currentlyStreaming.indexOf(ip),1);
  currentlyStreaming.splice(currentlyStreaming.indexOf(ip)+1,1);
  currentlyStreaming.splice(currentlyStreaming.indexOf(ip)-1,1)
  currentlyStreaming.splice(currentlyStreaming.indexOf(ip)-2,1)
}
function onMessageArrived(passcode, ip, port, name, title, sharer, bitrate, fps) {
  console.log("passcode recieved: "+passcode);
  console.log("streamIp recieved: "+ip);
  console.log("streamPort recieved: "+port);
  console.log("streamTitle recieved: "+title);
  console.log("fps recieved: "+fps);
  console.log("bitrate recieved: "+ bitrate);
  streamPasscode = passcode;
  streamIp = ip;
  streamtitle = title;
  streamFps = fps;
  streamBitrate = bitrate;
  streamSharer = sharer;
  currentlyStreaming.push(fps);
  currentlyStreaming.push(bitrate);
  currentlyStreaming.push(ip);
  currentlyStreaming.push(passcode);
  AddStream();
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // var newMessageLi;
 //  var messages = document.getElementById('messages');
  if (message) {
    switch (message.type) {
// case 'init':
//         init(message.clientId);
//         sendResponse("Done");
//         return true;
      case 'set-client-id':
        document.getElementById('client-id').textContent = message.value;
        break;
      case 'message':
        onMessageArrived(message.message, message.streamIp, message.streamPort, message.name, message.streamtitle, message.streamSharer, message.streamBitrate, message.streamFps);
        break;
      case 'remove-stream-from-screen':
        RemoveStream(message.ip);
        break;
      // case 'add-user':
      //   addUser(message.name, message.ip);
      //   break;
      // case 'refresh-user-list':
      //   refreshUserList();
      //   break;
      // case 'info':
      //   newMessageLi = document.createElement('li');
      //   newMessageLi.textContent = message.message;
      //   newMessageLi.setAttribute("class", message.level);
      //   messages.appendChild(newMessageLi);
      //   break;
    }
  }
});