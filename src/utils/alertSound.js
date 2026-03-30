import Sound from 'react-native-sound';

// Enable playback in silent mode (iOS)
Sound.setCategory('Playback');

let _alertSound = null;

function getAlertSound() {
  if (!_alertSound) {
    _alertSound = new Sound('order_alert.wav', Sound.MAIN_BUNDLE, (error) => {
      if (error) {
        console.warn('[AlertSound] Failed to load order_alert.wav:', error.message);
        _alertSound = null;
      }
    });
  }
  return _alertSound;
}

/**
 * Play the new-order alert sound.
 * Safe to call repeatedly — stops any current playback first.
 */
export function playNewOrderAlert() {
  try {
    const sound = getAlertSound();
    if (!sound) return;
    sound.stop(() => {
      sound.setVolume(1.0);
      sound.play((success) => {
        if (!success) {
          console.warn('[AlertSound] Playback failed, resetting');
          sound.reset();
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
  }
}
