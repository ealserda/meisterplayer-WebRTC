function WebRTCAdaptor(initialValues) {
  var self = this;
  self.peerconnection_config = null;
  self.sdp_constraints = null;
  self.remotePeerConnection = new Array();
  self.remoteDescriptionSet = new Array();
  self.iceCandidateList = new Array();
  self.webSocketAdaptor = null;
  self.playStreamId = new Array();
  self.micGainNode = null;

  self.isPlayMode = false;
  self.debug = false;

  for(var key in initialValues) {
    if(initialValues.hasOwnProperty(key)) {
      this[key] = initialValues[key];
    }
  }

  self.remoteVideo = self.remoteVideoPlayer;

  if (!("WebSocket" in window)) {
    self.callbackError("WebSocketNotSupported");
    return;
  }

  this.setRemoteVideoPlayer = function(remoteVideoPlayer) {
    self.remoteVideo = remoteVideoPlayer;
  }

  this.closeStream = function () {
    
    self.localStream.getVideoTracks().forEach(function(track) {
      track.onended = null;
            track.stop();
        });
    
    self.localStream.getAudioTracks().forEach(function(track) {
      track.onended = null;
            track.stop();
        });
    
  }

  if (this.isPlayMode && typeof self.mediaConstraints == "undefined")  {
    if (self.webSocketAdaptor == null || self.webSocketAdaptor.isConnected() == false) {
      self.webSocketAdaptor = new WebSocketAdaptor();
    }
  }

  this.play = function (streamId) {
    self.playStreamId.push(streamId);
    var jsCmd =
    {
        command : "play",
        streamId : streamId,
    }
    self.webSocketAdaptor.send(JSON.stringify(jsCmd));
  }

  this.stop = function(streamId) {
    self.closePeerConnection(streamId);

    var jsCmd = {
        command : "stop",
        streamId: streamId,
    };

    self.webSocketAdaptor.send(JSON.stringify(jsCmd));
  }

  this.leave = function (streamId) {

    var jsCmd = {
        command : "leave",
        streamId: streamId,
    };

    self.webSocketAdaptor.send(JSON.stringify(jsCmd));
    self.closePeerConnection(streamId);
  }

  this.getStreamInfo = function(streamId) {
    var jsCmd = {
        command : "getStreamInfo",
        streamId: streamId,
    };
    this.webSocketAdaptor.send(JSON.stringify(jsCmd));
  }

  this.onTrack = function(event, streamId) {
    if (self.remoteVideo != null) {
      if (self.remoteVideo.srcObject !== event.streams[0]) {
        self.remoteVideo.srcObject = event.streams[0];
      }
    }
    else {
      var dataObj = {
          track: event.streams[0],
          streamId: streamId
      }
      self.callback("newStreamAvailable", dataObj);
    }

  }

  this.iceCandidateReceived = function(event, streamId) {
    if (event.candidate) {

      var jsCmd = {
          command : "takeCandidate",
          streamId : streamId,
          label : event.candidate.sdpMLineIndex,
          id : event.candidate.sdpMid,
          candidate : event.candidate.candidate
      };

      if (self.debug) {
        console.log("sending ice candiate for stream Id " + streamId );
        console.log(JSON.stringify(event.candidate));
      }

      self.webSocketAdaptor.send(JSON.stringify(jsCmd));
    }
  }

  this.initPeerConnection = function(streamId) {
    if (self.remotePeerConnection[streamId] == null) 
    {
      var closedStreamId = streamId;
      self.remotePeerConnection[streamId] = new RTCPeerConnection(self.peerconnection_config);
      self.remoteDescriptionSet[streamId] = false;
      self.iceCandidateList[streamId] = new Array();
      if (!self.playStreamId.includes(streamId)) 
      {
        self.remotePeerConnection[streamId].addStream(self.localStream);
      }
      self.remotePeerConnection[streamId].onicecandidate = function(event) {
        self.iceCandidateReceived(event, closedStreamId);
      }
      self.remotePeerConnection[streamId].ontrack = function(event) {
        self.onTrack(event, closedStreamId);
      }
    }
  }

  this.closePeerConnection = function(streamId) {
    if (self.remotePeerConnection[streamId] != null
        && self.remotePeerConnection[streamId].signalingState != "closed") {
      self.remotePeerConnection[streamId].close();
      self.remotePeerConnection[streamId] = null;
      delete self.remotePeerConnection[streamId];
      var playStreamIndex = self.playStreamId.indexOf(streamId);
      if (playStreamIndex != -1) {
        self.playStreamId.splice(playStreamIndex, 1);
      }

    }
  }

  this.signallingState = function(streamId) {
    if (self.remotePeerConnection[streamId] != null) {
      return self.remotePeerConnection[streamId].signalingState;
    }
    return null;
  }

  this.iceConnectionState = function(streamId) {
    if (self.remotePeerConnection[streamId] != null) {
      return self.remotePeerConnection[streamId].iceConnectionState;
    }
    return null;
  }

  this.gotDescription = function(configuration, streamId) 
  {
    self.remotePeerConnection[streamId]
    .setLocalDescription(configuration)
    .then(function(responose)  {
      console.debug("Set local description successfully for stream Id " + streamId);

      var jsCmd = {
          command : "takeConfiguration",
          streamId : streamId,
          type : configuration.type,
          sdp : configuration.sdp
      };

      if (self.debug) {
        console.debug("local sdp: ");
        console.debug(configuration.sdp);
      }

      self.webSocketAdaptor.send(JSON.stringify(jsCmd));

        }).catch(function(error){
          console.error("Cannot set local description. Error is: " + error);
        });
  }

  this.takeConfiguration = function (idOfStream, configuration, typeOfConfiguration) 
  {
    var streamId = idOfStream
    var type = typeOfConfiguration;
    var conf = configuration;

    self.initPeerConnection(streamId);

    self.remotePeerConnection[streamId].setRemoteDescription(new RTCSessionDescription({
      sdp : conf,
      type : type
    })).then(function(response)  {

      if (self.debug) {
        console.debug("set remote description is succesfull with response: " + response + " for stream : " 
            + streamId + " and type: " + type);
        console.debug(conf);
      }
      
      self.remoteDescriptionSet[streamId] = true;
      var length = self.iceCandidateList[streamId].length;
      console.debug("Ice candidate list size to be added: " + length);
      for (var i = 0; i < length; i++) {
        self.addIceCandidate(streamId, self.iceCandidateList[streamId][i]);
      }
      self.iceCandidateList[streamId] = [];

      if (type == "offer") {
        self.remotePeerConnection[streamId].createAnswer(self.sdp_constraints)
        .then(function(configuration) {
          self.gotDescription(configuration, streamId);
        }).catch(function(error) {
          if (self.debug) {
            console.error("create answer error :" + error);
          }
        });
      }

    }).catch(function(error){
      if (self.debug) {
        console.error("set remote description is failed with error: " + error);
      }
    });
  }

  this.takeCandidate = function(idOfTheStream, tmpLabel, tmpCandidate) {
    var streamId = idOfTheStream;
    var label = tmpLabel;
    var candidateSdp = tmpCandidate;

    var candidate = new RTCIceCandidate({
      sdpMLineIndex : label,
      candidate : candidateSdp
    });

    self.initPeerConnection(streamId);
    
    if (self.remoteDescriptionSet[streamId] == true) {
      self.addIceCandidate(streamId, candidate);
    }
    else {
      console.debug("Ice candidate is added to list because remote description is not set yet");
      self.iceCandidateList[streamId].push(candidate);
    }

  }
  
  this.addIceCandidate = function(streamId, candidate) {
    self.remotePeerConnection[streamId].addIceCandidate(candidate)
    .then(function(response) {
      if (self.debug) {
        console.log("Candidate is added for stream " + streamId);
      }
    })
    .catch(function (error) {
      console.error("ice candiate cannot be added for stream id: " + streamId + " error is: " + error  );
      console.error(candidate);
    });
  }

  function WebSocketAdaptor() {
    var wsConn = new WebSocket(self.websocket_url);

    var connected = false;

    wsConn.onopen = function() {
      if (self.debug) {
        console.log("websocket connected");
      }

      connected = true;
      self.callback("initialized");
    }

    this.send = function(text) {

      if (wsConn.readyState == 0 || wsConn.readyState == 2 || wsConn.readyState == 3) {
        self.callbackError("WebSocketNotConnected");
        return;
      }
      wsConn.send(text);
    }

    this.isConnected = function() {
      return connected;
    }

    wsConn.onmessage = function(event) {
      var obj = JSON.parse(event.data);
      if (obj.command == "takeCandidate") {

        if (self.debug) {
          console.debug("received ice candidate for stream id " + obj.streamId);
          console.debug(obj.candidate);
        }

        self.takeCandidate(obj.streamId, obj.label, obj.candidate);

      } else if (obj.command == "takeConfiguration") {

        if (self.debug) {
          console.log("received remote description type for stream id: " + obj.streamId + " type: " + obj.type );
        }
        self.takeConfiguration(obj.streamId, obj.sdp, obj.type);

      }
      else if (obj.command == "stop") {
        console.debug("Stop command received");
        self.closePeerConnection(obj.streamId);
      }
      else if (obj.command == "error") {
        self.callbackError(obj.definition);
      }
      else if (obj.command == "notification") {
        self.callback(obj.definition, obj);
        if (obj.definition == "play_finished" || obj.definition == "publish_finished") {
          self.closePeerConnection(obj.streamId);
        }
      }
      else if (obj.command == "streamInformation") {
        self.callback(obj.command, obj);
      }
    }

    wsConn.onerror = function(error) {
      self.callbackError(error)
    }

    wsConn.onclose = function(event) {
      connected = false;
      self.callback("closed", event);
    }
  };
}

export default WebRTCAdaptor;