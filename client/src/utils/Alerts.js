let showAlertFn = () => {};
let showConfirmFn = () => {};
let showPromptFn = () => {};

export const registerAlerts = (alertFn, confirmFn, promptFn) => {
  showAlertFn = alertFn;
  showConfirmFn = confirmFn;
  showPromptFn = promptFn;
};

export const showAlert = (message) => {
  return showAlertFn(message);
};

export const showConfirm = (message) => {
  return showConfirmFn(message);
};

export const showPrompt = (message, defaultValue = '') => {
  return showPromptFn(message, defaultValue);
};
