import Sound from 'react-native-sound';

// Enable playback in silent mode (iOS)
Sound.setCategory('Playback');

let _alertSound = null;
let _loaded = false;

function initAlertSound() {
  if (_alertSound) return;
  _alertSound = new Sound('order_alert.wav', Sound.MAIN_BUNDLE, (error) => {
    if (error) {
      console.warn('[AlertSound] Failed to load order_alert.wav:', error.message);
      _alertSound = null;
      _loaded = false;
    } else {
      _loaded = true;
    }
  });
}

// Pre-load on import
initAlertSound();

/**
 * Play the new-order alert sound.
 * Safe to call repeatedly — stops any current playback first.
 */
export function playNewOrderAlert() {
  try {
    if (!_alertSound || !_loaded) return;
    _alertSound.stop(() => {
      _alertSound.setVolume(1.0);
      _alertSound.play((ok) => {
        if (!ok) {
          console.warn('[AlertSound] Playback failed, resetting');
          _alertSound.reset();
        }
      });
    });
  } catch (err) {
    console.warn('[AlertSound] Error playing sound:', err.message);
  }
}

/**
 * Release sound resources (call on unmount if needed).
 */
export function releaseAlertSound() {
  if (_alertSound) {
    _alertSound.release();
    _alertSound = null;
    _loaded = false;
  }
}
