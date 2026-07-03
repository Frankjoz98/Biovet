export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

const showToast = (message: string, type: ToastMessage['type'] = 'info') => {
  const event = new CustomEvent('biovet-toast', {
    detail: {
      id: Math.random().toString(36).substring(2, 9),
      message,
      type
    }
  });
  window.dispatchEvent(event);
};

export const toast = {
  success: (msg: string) => showToast(msg, 'success'),
  error: (msg: string) => showToast(msg, 'error'),
  warning: (msg: string) => showToast(msg, 'warning'),
  info: (msg: string) => showToast(msg, 'info'),
};
