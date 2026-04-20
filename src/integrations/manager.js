const db = require('../database');
const { decrypt } = require('../lib/crypto');
const intune = require('./intune');
const googleAdmin = require('./google-admin');

class IntegrationManager {
  constructor(orgId) {
    this.orgId = orgId;
    this._row = null;
  }

  async loadConfig() {
    this._row = await db('org_integrations').where('org_id', this.orgId).first();
    return this._row;
  }

  _intuneCreds() {
    if (!this._row?.intune_enabled) return null;
    if (!this._row.intune_tenant_id || !this._row.intune_client_id || !this._row.intune_client_secret_enc) {
      return null;
    }
    return {
      tenantId: this._row.intune_tenant_id,
      clientId: this._row.intune_client_id,
      clientSecret: decrypt(this._row.intune_client_secret_enc),
    };
  }

  _googleCreds() {
    if (!this._row?.google_enabled) return null;
    if (!this._row.google_admin_email || !this._row.google_service_account_enc) return null;
    const json = decrypt(this._row.google_service_account_enc);
    return {
      serviceAccountJson: json,
      adminEmail: this._row.google_admin_email,
      customerId: this._row.google_customer_id || 'my_customer',
    };
  }

  async getAllDevices() {
    await this.loadConfig();
    const tasks = [];

    const intuneCreds = this._intuneCreds();
    if (intuneCreds) {
      tasks.push(
        intune
          .getDevices(intuneCreds.tenantId, intuneCreds.clientId, intuneCreds.clientSecret)
          .then((devices) => ({ source: 'intune', devices }))
          .catch((err) => ({ source: 'intune', devices: [], error: err.message }))
      );
    }

    const googleCreds = this._googleCreds();
    if (googleCreds) {
      tasks.push(
        googleAdmin
          .getChromebookDevices(
            null,
            googleCreds.serviceAccountJson,
            googleCreds.adminEmail,
            googleCreds.customerId
          )
          .then((devices) => ({ source: 'google_admin', devices }))
          .catch((err) => ({ source: 'google_admin', devices: [], error: err.message }))
      );
    }

    const parts = await Promise.all(tasks);
    const merged = [];
    const errors = {};
    const stripInternal = (d) => {
      if (!d || !d._raw) return d;
      const { _raw, ...rest } = d;
      return rest;
    };
    for (const p of parts) {
      if (p.error) errors[p.source] = p.error;
      merged.push(...(p.devices || []).map(stripInternal));
    }
    return { devices: merged, errors };
  }

  async getHealthSummary() {
    await this.loadConfig();
    const summary = {
      intune: { enabled: !!this._row?.intune_enabled, ok: false, message: null, deviceCount: null },
      google: { enabled: !!this._row?.google_enabled, ok: false, message: null, deviceCount: null },
      checkedAt: new Date().toISOString(),
    };

    const intuneCreds = this._intuneCreds();
    if (intuneCreds) {
      try {
        const list = await intune.getDevices(
          intuneCreds.tenantId,
          intuneCreds.clientId,
          intuneCreds.clientSecret
        );
        summary.intune.ok = true;
        summary.intune.deviceCount = list.length;
      } catch (e) {
        summary.intune.message = e.message;
      }
    } else if (this._row?.intune_enabled) {
      summary.intune.message = 'Intune is enabled but credentials are incomplete.';
    }

    const googleCreds = this._googleCreds();
    if (googleCreds) {
      try {
        const list = await googleAdmin.getChromebookDevices(
          null,
          googleCreds.serviceAccountJson,
          googleCreds.adminEmail,
          googleCreds.customerId
        );
        summary.google.ok = true;
        summary.google.deviceCount = list.length;
      } catch (e) {
        summary.google.message = e.message;
      }
    } else if (this._row?.google_enabled) {
      summary.google.message = 'Google is enabled but credentials are incomplete.';
    }

    return summary;
  }

  async syncDevice(deviceId, source) {
    await this.loadConfig();
    if (source === 'intune') {
      const c = this._intuneCreds();
      if (!c) throw new Error('Intune is not configured.');
      return intune.syncDevice(deviceId, c.tenantId, c.clientId, c.clientSecret);
    }
    if (source === 'google_admin') {
      const c = this._googleCreds();
      if (!c) throw new Error('Google Admin is not configured.');
      await googleAdmin.getChromebookDevice(
        deviceId,
        c.serviceAccountJson,
        c.adminEmail,
        c.customerId
      );
      return { ok: true, mode: 'refresh', source: 'google_admin' };
    }
    throw new Error(`Unknown integration source: ${source}`);
  }

  async testConnections() {
    await this.loadConfig();
    const results = { intune: null, google: null, checkedAt: new Date().toISOString() };

    const ic = this._intuneCreds();
    if (ic) {
      try {
        await intune.getAccessToken(ic.tenantId, ic.clientId, ic.clientSecret);
        results.intune = { ok: true };
      } catch (e) {
        results.intune = { ok: false, error: e.message };
      }
    }

    const gc = this._googleCreds();
    if (gc) {
      try {
        await googleAdmin.getAccessToken(gc.serviceAccountJson, gc.adminEmail);
        results.google = { ok: true };
      } catch (e) {
        results.google = { ok: false, error: e.message };
      }
    }

    return results;
  }
}

module.exports = { IntegrationManager };
