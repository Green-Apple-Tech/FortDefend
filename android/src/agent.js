import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const API_BASE_URL = 'https://app.fortdefend.com';
const HEARTBEAT_TASK = 'fortdefend-heartbeat-task';

export const AGENT_STORAGE_KEYS = {
  ORG_TOKEN: 'fortdefend_org_token',
  FCM_TOKEN: 'fortdefend_fcm_token',
  LAST_HEARTBEAT: 'fortdefend_last_heartbeat',
  LAST_ERROR: 'fortdefend_last_error',
};

let heartbeatCallback = null;
let notificationSubscription = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const postJson = async (path, body) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response;
};

const normalizeError = (error) => {
  if (!error) {
    return 'Unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  return error.message || 'Unknown error';
};

const buildHeartbeatPayload = async (orgToken, fcmToken) => {
  const profile = await getDeviceProfile();
  return {
    deviceId: profile.deviceId,
    orgToken,
    deviceName: profile.deviceName,
    model: profile.model,
    os: 'Android',
    osVersion: profile.osVersion,
    manufacturer: profile.manufacturer,
    fcmToken,
  };
};

const requestNotificationPermissions = async () => {
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.granted) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
};

const registerForPushNotifications = async () => {
  const isPhysicalDevice = Device.isDevice;
  if (!isPhysicalDevice) {
    return null;
  }

  const granted = await requestNotificationPermissions();
  if (!granted) {
    return null;
  }

  const tokenData = await Notifications.getDevicePushTokenAsync();
  return tokenData?.data || null;
};

export const getDeviceProfile = async () => {
  const androidId = Application.getAndroidId ? await Application.getAndroidId() : null;
  return {
    deviceId:
      androidId ||
      Device.osBuildId ||
      Device.osInternalBuildId ||
      `${Device.brand || Device.manufacturer || 'android'}-${Device.modelId || Device.modelName || 'device'}`,
    deviceName: Device.deviceName || 'Android Device',
    model: Device.modelName || 'Unknown',
    osVersion: Device.osVersion || 'Unknown',
    manufacturer: Device.manufacturer || 'Unknown',
  };
};

export const registerFcmToken = async (orgToken, fcmToken) => {
  if (!fcmToken) {
    return;
  }

  await postJson('/api/android/register-fcm', {
    orgToken,
    fcmToken,
  });
};

export const sendHeartbeat = async (orgToken, fcmTokenOverride = null) => {
  const fcmToken =
    fcmTokenOverride || (await AsyncStorage.getItem(AGENT_STORAGE_KEYS.FCM_TOKEN));
  const payload = await buildHeartbeatPayload(orgToken, fcmToken);

  await postJson('/api/android/heartbeat', payload);

  const nowIso = new Date().toISOString();
  await AsyncStorage.setItem(AGENT_STORAGE_KEYS.LAST_HEARTBEAT, nowIso);
  await AsyncStorage.removeItem(AGENT_STORAGE_KEYS.LAST_ERROR);
  if (heartbeatCallback) {
    heartbeatCallback(nowIso);
  }
};

const handleCommand = async (data = {}) => {
  const commandType = data.type;

  if (commandType === 'lock') {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'FortDefend Lock Command',
        body: 'Your administrator requested a lock action.',
      },
      trigger: null,
    });
    return;
  }

  if (commandType === 'ring') {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'FortDefend Ring Command',
        body: 'Ringing device now. Tap to acknowledge.',
        sound: true,
      },
      trigger: null,
    });
    return;
  }

  if (commandType === 'message') {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'FortDefend Message',
        body: data.message || 'New message from your administrator.',
      },
      trigger: null,
    });
  }
};

TaskManager.defineTask(HEARTBEAT_TASK, async () => {
  try {
    const orgToken = await AsyncStorage.getItem(AGENT_STORAGE_KEYS.ORG_TOKEN);
    if (!orgToken) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    await sendHeartbeat(orgToken);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    await AsyncStorage.setItem(AGENT_STORAGE_KEYS.LAST_ERROR, normalizeError(error));
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

const configureBackgroundHeartbeat = async () => {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK);
  if (isRegistered) {
    return;
  }

  await BackgroundFetch.registerTaskAsync(HEARTBEAT_TASK, {
    minimumInterval: 15 * 60,
    stopOnTerminate: false,
    startOnBoot: true,
  });
};

export const startAgent = async ({ orgToken, onHeartbeat }) => {
  heartbeatCallback = onHeartbeat || null;
  await AsyncStorage.setItem(AGENT_STORAGE_KEYS.ORG_TOKEN, orgToken);
  await AsyncStorage.removeItem(AGENT_STORAGE_KEYS.LAST_ERROR);

  try {
    const fcmToken = await registerForPushNotifications();
    if (fcmToken) {
      await AsyncStorage.setItem(AGENT_STORAGE_KEYS.FCM_TOKEN, fcmToken);
      await registerFcmToken(orgToken, fcmToken);
    }

    await sendHeartbeat(orgToken, fcmToken);
    await configureBackgroundHeartbeat();
  } catch (error) {
    await AsyncStorage.setItem(AGENT_STORAGE_KEYS.LAST_ERROR, normalizeError(error));
    throw error;
  }

  if (notificationSubscription) {
    notificationSubscription.remove();
  }

  notificationSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      handleCommand(notification.request?.content?.data);
    }
  );
};

export const stopAgent = () => {
  if (notificationSubscription) {
    notificationSubscription.remove();
    notificationSubscription = null;
  }
  heartbeatCallback = null;
};

export const getLastAgentError = async () =>
  AsyncStorage.getItem(AGENT_STORAGE_KEYS.LAST_ERROR);
