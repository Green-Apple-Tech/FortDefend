import { api } from '../../lib/api';

export function patchErrorMessage(err, fallback = 'Failed to load patch data.') {
  if (err?.status === 404) {
    return 'Patch API endpoint not found. Ensure the latest server is deployed.';
  }
  if (err?.status === 401 || err?.status === 403) {
    return err?.message || 'You do not have permission to view patch data.';
  }
  if (err?.status >= 500) {
    return (
      err?.message ||
      'Patch Manager database may not be migrated yet. Run npm run migrate on the server.'
    );
  }
  return err?.message || fallback;
}

/**
 * @param {string} path
 * @param {{ fallback?: unknown, request?: object, label?: string }} [opts]
 */
export async function fetchPatch(path, opts = {}) {
  const { fallback, request, label } = opts;
  try {
    return await api(path, request || {});
  } catch (err) {
    console.error(`[Patch Manager] ${label || path}`, {
      status: err?.status,
      message: err?.message,
      data: err?.data,
    });
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export function PatchLoadError({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">Could not load Patch Manager data</p>
      <p className="mt-2">{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="mt-3 rounded bg-amber-900 px-3 py-1.5 text-xs font-medium text-white"
          onClick={onRetry}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
