import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { sendAndroidHeartbeat } from './heartbeatService';

const HEARTBEAT_TASK = 'fortdefend-background-heartbeat';
const HEARTBEAT_INTERVAL_SECONDS = 15 * 60;
const STORAGE_TOKEN_KEY = 'fortdefend_org_token';
const STORAGE_LAST_SCAN_KEY = 'fortdefend_last_scan_at';
const STORAGE_NOTIFICATION_ID_KEY = 'fortdefend_notification_id';

let foregroundTimer = null;

async function ensureNotificationChannel() {
  await Notifications.setNotificationChannelAsync('fortdefend-protection', {
    name: 'FortDefend Protection',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
}

function minsSince(iso) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'just now';
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  return mins <= 0 ? 'just now' : `${mins} min ago`;
}

export async function updateProtectionNotification(lastScanAt) {
  try {
    await ensureNotificationChannel();
    const existingId = await AsyncStorage.getItem(STORAGE_NOTIFICATION_ID_KEY);
    if (existingId) {
      await Notifications.dismissNotificationAsync(existingId).catch(() => {});
    }
    const content = {
      title: '🛡️ FortDefend is protecting your device',
      body: `Last scan: ${minsSince(lastScanAt)}`,
      sticky: true,
      autoDismiss: false,
      sound: false,
      priority: Notifications.AndroidNotificationPriority.MAX,
    };
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: null,
    });
    await AsyncStorage.setItem(STORAGE_NOTIFICATION_ID_KEY, id);
  } catch {
    // graceful fallback when notifications are unavailable
  }
}

async function runHeartbeatOnce() {
  const token = await AsyncStorage.getItem(STORAGE_TOKEN_KEY);
  if (!token) return false;
  const result = await sendAndroidHeartbeat(token);
  await AsyncStorage.setItem(STORAGE_LAST_SCAN_KEY, result.sentAt);
  await updateProtectionNotification(result.sentAt);
  return true;
}

TaskManager.defineTask(HEARTBEAT_TASK, async () => {
  try {
    const didSend = await runHeartbeatOnce();
    return didSend ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function startBackgroundProtection(orgToken) {
  await AsyncStorage.setItem(STORAGE_TOKEN_KEY, String(orgToken || '').trim());
  await runHeartbeatOnce().catch(() => {});
  const registered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK);
  if (!registered) {
    await BackgroundFetch.registerTaskAsync(HEARTBEAT_TASK, {
      minimumInterval: HEARTBEAT_INTERVAL_SECONDS,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }

  if (foregroundTimer) clearInterval(foregroundTimer);
  foregroundTimer = setInterval(() => {
    runHeartbeatOnce().catch(() => {});
  }, HEARTBEAT_INTERVAL_SECONDS * 1000);
}

export async function stopBackgroundProtection() {
  if (foregroundTimer) {
    clearInterval(foregroundTimer);
    foregroundTimer = null;
  }
  const registered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK);
  if (registered) {
    await BackgroundFetch.unregisterTaskAsync(HEARTBEAT_TASK);
  }
  await AsyncStorage.removeItem(STORAGE_TOKEN_KEY);
  await AsyncStorage.removeItem(STORAGE_LAST_SCAN_KEY);
}

export async function getBackgroundProtectionStatus() {
  const [token, registered, lastScanAt] = await Promise.all([
    AsyncStorage.getItem(STORAGE_TOKEN_KEY),
    TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK),
    AsyncStorage.getItem(STORAGE_LAST_SCAN_KEY),
  ]);
  return {
    active: Boolean(token) && registered,
    lastScanAt: lastScanAt || null,
  };
}

export async function requestBatteryOptimizationExemption() {
  Alert.alert(
    'Background protection',
    'Allow FortDefend to run in background for continuous protection?',
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Allow',
        onPress: () => {
          Linking.openSettings().catch(() => {});
        },
      },
    ],
  );
}

export { HEARTBEAT_TASK };

