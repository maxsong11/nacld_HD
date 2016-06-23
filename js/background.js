// Copyright (c) 2013 The Chromium Authors. All rights reserved.
// Copyright 2015 Intel Corporation. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
var logWindow = null;

function makeURL(toolchain, config) {
  return 'build.html?tc=' + toolchain + '&config=' + config;
}

function createWindow(url) {
  console.log('loading ' + url);
  chrome.app.window.create(url, {
    width: 720,
    height: 600
  },onInitWindow);
}

function createLogWindow(createdCb, closedCb) {
  if (logWindow) {
    console.log('ERROR: log window already open.');
    return;
  }

  console.log('loading log window');

  chrome.app.window.create('log.html', {
    id: "log",
    width: 720,
    height: 800
  },
  function(win) {
    logWindow = win.id;
    win.onClosed.addListener(closedCb);
    win.contentWindow.logConfig = createdCb;
  });
}

function onLaunched(launchData) {
  // Send and XHR to get the URL to load from a configuration file.
  // Normally you won't need to do this; just call:
  //
  // chrome.app.window.create('<your url>', {...});
  //
  // In the SDK we want to be able to load different URLs (for different
  // toolchain/config combinations) from the commandline, so we to read
  // this information from the file "config.json".
  //
  // Use a JSON config file with the following format:
  // {
  //    'toolchain': <name of the toolchain to use>,
  //    'build_config': <array of config options to try to load>
  // }
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'config.json', true);
  xhr.onload = function() {
    var config = JSON.parse(this.responseText);
    var toolchain = null;
    var build_config = null;
    console.log(config);
    if (config.build_config && config.build_config.length > 0)
      build_config = config.build_config;

    if (config.toolchain)
      toolchain = config.toolchain;

    createWindow(makeURL(toolchain, build_config));
  };
  xhr.onerror = function() {
    // Can't find the config file, just load the default.
    createWindow('build.html');
  };
  xhr.send();
}

//multicast stuff
var kIP = "237.132.123.123";
var kPort = 3038;
var chatClient;
var clientId;


function random_string(length) {
  var str = '';
  for (var i = 0; i < length; i++) {
    str += (Math.random() * 16 >> 0).toString(16);
  }
  return str;
}

function rtm(message, callback) {
  if (callback) {
    chrome.runtime.sendMessage(chrome.runtime.id, message, callback);
  } else {
    chrome.runtime.sendMessage(chrome.runtime.id, message);
  }
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message) {
    switch (message.type) {
      case 'set-client-id':
        chatClient.renameTo(message.value, function (name) {
          chrome.storage.local.set({
            'client_id': message.value
          }, function(){
            sendResponse(name);
            clientId = name;
            rtm({
              type: 'refresh-user-list'
            });
          });
        });
        return true;
        break;
      case 'query-users':
        sendResponse(chatClient.knownUsers);
        break;
      case 'send-message':
        chatClient.sendMessage(message.message, message.streamIp, message.streamPort, message.title, message.sharerName, message.bitrate, message.fps, function () {
        sendResponse(true);
        });
        return true;
        break;
      case 'remove-stream':
        chatClient.removeStream(message.streamIp,function () {
          sendResponse(true);
        });
        return true;
        break;
    }
  }
  return false;
});

function onInitWindow(appWindow) {
  appWindow.show();
  var document = appWindow.contentWindow.document;
  document.addEventListener('DOMContentLoaded', function () {
    rtm({
      "type": 'init',
      clientId: clientId
    }, function () {
      chatClient.enter();
    });
  });
  appWindow.onClosed.addListener(function(){
    chatClient.exit();
  });
}

function initClient(id) {
  var cc = new ChatClient({
    name: id,
    address: kIP,
    port: kPort
  });
  cc.onInfo = function (message, level) {
    level = level || 'info';
    rtm({
      type: 'info',
      level: level,
      message: message
    });
  };
  cc.onAddUser = function (name, ip) {
    rtm({
      type: 'add-user',
      name: name,
      ip: ip
    })
  };
  cc.onRemoveUser = function (name, ip) {
    rtm({
      type: 'remove-user',
      name: name,
      ip: ip
    })
  };
  cc.onRemoveStream = function (ip) {
    rtm({
      type: 'remove-stream-from-screen',
      ip: ip
    })
  };
  cc.onMessage = function (message, streamIp,streamPort, name, ip, streamtitle, streamSharer, streamBitrate, streamFps) {
    rtm({
      type: 'message',
      name: name,
      message: message,
      streamIp: streamIp,
      streamPort: streamPort,
      streamtitle: streamtitle,
      streamSharer:streamSharer,
      streamBitrate:streamBitrate,
      streamFps:streamFps
    })
  };
  clientId = id;
  chatClient = cc;
}

chrome.storage.local.get('client_id', function (result) {
  if (result && ('client_id' in result)) {
    initClient(result.client_id);
  } else {
    var id = 'client' + random_string(16);
    chrome.storage.local.set({
      'client_id': id
    }, function () {
      initClient(id);
    });
  }
});

chrome.app.runtime.onLaunched.addListener(function () {
  function waitForChatClient() {
    if (clientId) {
      onLaunched();
    } else {
      setTimeout(waitForChatClient);
    }
  }
  waitForChatClient();
});
