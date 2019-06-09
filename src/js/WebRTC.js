import WebRTCAdaptor from './services/webrtc_adaptor';

class WebRTC extends Meister.MediaPlugin {

  constructor(config, meister) {
      super(config, meister);
  }

  static get pluginName() {
    return 'WebRTC';
  }

  isItemSupported(item) {
    return new Promise((resolve) => {
      if (item.type.toLowerCase() === 'webrtc') {
        if(window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection) {
          resolve({
            supported: true,
          });
        } else {
          resolve({
            supported: false,
            errorCode: Meister.ErrorCodes.NOT_SUPPORTED,
          });
        }
      } else {
        resolve({
          supported: false,
          errorCode: Meister.ErrorCodes.WRONG_TYPE,
        });
      }
    });
  }

  get currentItem() {
    const currentItem = {
      src: this.item.src,
      type: this.item.type,
      streamId: this.item.streamId
    }

    return this.currentItem;
  }

  process(item) {
    return new Promise((resolve) => {
      this.player = this.meister.getPlayerByType('html5', item);
      resolve(item);
    });
  }

  load(item) {
    super.load(item);
    this.item = item;

    return new Promise(async (resolve) => {
      let config = Object.assign({
        websocket_url : item.src,
        isPlayMode : true,
        remoteVideoPlayer: this.player.mediaElement,
        debug : false,
        callback: (info, description) => {
          if (info === "initialized") {
            if (this.meister.config.autoplay) {
              this.webRTCAdaptor.play(item.streamId);
            } else {
              this.one('requestPlay', () => {
                this.webRTCAdaptor.play(item.streamId);
              });
            }
          }
        },
        callbackError : error => {
            console.error(`Something went wrong while 
              processing the WebRTC stream. ${error}`);
        }
      }, this.config);

      this.webRTCAdaptor = new WebRTCAdaptor(config);

      this.meister.trigger('itemTimeInfo', {
        isLive: true,
      });
      resolve();
    });
  }

  _onPlayerTimeUpdate() {
      this.meister.trigger('playerTimeUpdate', {
          currentTime: this.player.currentTime,
      });
  }
  unload() {
    super.unload();
    this.player = null;
  }
}

Meister.registerPlugin(WebRTC.pluginName, WebRTC);
export default WebRTC;