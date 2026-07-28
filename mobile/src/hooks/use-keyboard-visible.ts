import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Whether the soft keyboard is currently on screen.
 *
 * Chat-style screens pin a composer to the bottom and pad it by the tab bar
 * height so it clears the floating tab bar. Once the keyboard opens, the tab bar
 * is behind the keyboard and that padding becomes a dead gap between the input
 * and the keys — so the padding has to be conditional, which means knowing when
 * the keyboard is up.
 *
 * iOS gets the `Will` events so the padding changes in step with the keyboard
 * animation; Android only fires the `Did` variants reliably.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
