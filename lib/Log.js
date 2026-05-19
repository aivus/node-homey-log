'use strict';

const HomeyModule = require('homey');

const Sentry = require('@sentry/node-core');

class Log {

  /**
   * Construct a new Log instance.
   * @param {object} args
   * @param {HomeyModule} args.homey - `this.homey` instance in
   * your app (e.g. `App#homey`/`Driver#homey`/`Device#homey`).
   *
   * @param {object} [args.options] - Additional options for Sentry (`@sentry/node` init options)
   *
   * @example
   * class MyApp extends Homey.App {
   *   onInit() {
   *     this.homeyLog = new Log({ homey: this.homey });
   *   }
   * }
   */
  constructor({ homey, options }) {
    this._capturedMessages = [];
    this._capturedExceptions = [];

    if (typeof homey === 'undefined') {
      return Log._error('Error: missing `homey` constructor parameter');
    }

    if (!HomeyModule.env) {
      return Log._error('Error: could not access `HomeyModule.env`');
    }

    if (typeof HomeyModule.env.HOMEY_LOG_URL !== 'string') {
      return Log._error('Error: expected `HOMEY_LOG_URL` env variable, homey-log is disabled');
    }

    // Check if debug mode is enabled
    const disableSentry = process.env.DEBUG === '1' && HomeyModule.env.HOMEY_LOG_FORCE !== '1';
    if (disableSentry) {
      Log._log('App is running in debug mode, disabling Sentry');
    }

    this._manifest = HomeyModule.manifest;
    this._homeyVersion = homey.version;
    this._managerCloud = homey.cloud;

    this.init(HomeyModule.env.HOMEY_LOG_URL, !disableSentry, { ...options });
  }

  /**
   * Init Sentry.
   * @param {string} url - Sentry DSN
   * @param {boolean} enabled - Whether to send events upstream
   * @param {object} opts - `@sentry/node` init options
   * @returns {Log}
   * @private
   */
  init(url, enabled, opts) {
    Sentry.init({
      dsn: url,
      enabled,
      ...opts,
    });

    this.setTags({
      appId: this._manifest.id,
      appVersion: this._manifest.version,
      homeyVersion: this._homeyVersion,
    });

    // Get homey cloud id and set as tag
    this._managerCloud.getHomeyId()
      .then(homeyId => this.setTags({ homeyId }))
      .catch(err => Log._error('Error: could not get `homeyId`', err));

    Log._log(`App ${this._manifest.id} v${this._manifest.version} logging on Homey v${this._homeyVersion}...`);
    return this;
  }

  /**
   * Set `tags` that will be send as context with every message or error. See the Sentry
   * documentation: https://docs.sentry.io/platforms/javascript/guides/node/enriching-events/tags/
   * @param {object} tags
   * @returns {Log}
   */
  setTags(tags) {
    Log._mergeContext('tags', tags);
    return this;
  }

  /**
   * Set `extra` that will be send as context with every message or error. See the Sentry
   * documentation: https://docs.sentry.io/platforms/javascript/guides/node/enriching-events/context/
   * @param {object} extra
   * @returns {Log}
   */
  setExtra(extra) {
    Log._mergeContext('extra', extra);
    return this;
  }

  /**
   * Set `user` that will be send as context with every message or error. See the Sentry
   * documentation: https://docs.sentry.io/platforms/javascript/guides/node/enriching-events/identify-user/
   * @param {object} user
   * @returns {Log}
   */
  setUser(user) {
    Log._mergeContext('user', user);
    return this;
  }

  /**
   * Create and send message event to Sentry. See the Sentry documentation:
   * https://docs.sentry.io/platforms/javascript/guides/node/usage/#capturing-messages
   * @param {string} message - Message to be sent
   * @returns {Promise<string>|undefined}
   */
  async captureMessage(message) {
    Log._log('captureMessage:', message);

    if (this._capturedMessages.indexOf(message) > -1) {
      Log._log('Prevented sending a duplicate message');
      return;
    }

    this._capturedMessages.push(message);

    // eslint-disable-next-line consistent-return
    return Sentry.captureMessage(message);
  }

  /**
   * Create and send exception event to Sentry. See the Sentry documentation:
   * https://docs.sentry.io/platforms/javascript/guides/node/usage/#capturing-errors
   * @param {Error} err - Error instance to be sent
   * @returns {Promise<string>|undefined}
   */
  async captureException(err) {
    Log._log('captureException:', err);

    if (this._capturedExceptions.indexOf(err) > -1) {
      Log._log('Prevented sending a duplicate log');
      return;
    }

    this._capturedExceptions.push(err);

    // eslint-disable-next-line consistent-return
    return Sentry.captureException(err);
  }

  /**
   * Mimic SDK log method.
   * @private
   */
  static _log() {
    // eslint-disable-next-line prefer-spread,prefer-rest-params,no-console
    console.log.bind(null, Log._logTime(), '[homey-log]').apply(null, arguments);
  }

  /**
   * Mimic SDK error method.
   * @private
   */
  static _error() {
    // eslint-disable-next-line prefer-spread,prefer-rest-params,no-console
    console.error.bind(null, Log._logTime(), '[homey-log]').apply(null, arguments);
  }

  /**
   * Mimic SDK timestamp.
   * @returns {string}
   * @private
   */
  static _logTime() {
    const date = new Date();

    let mm = date.getMonth() + 1;
    mm = (mm < 10 ? `0${mm}` : mm);
    let dd = date.getDate();
    dd = (dd < 10 ? `0${dd}` : dd);
    let hh = date.getHours();
    hh = (hh < 10 ? `0${hh}` : hh);
    let min = date.getMinutes();
    min = (min < 10 ? `0${min}` : min);
    let sec = date.getSeconds();
    sec = (sec < 10 ? `0${sec}` : sec);

    return `${date.getFullYear()}-${mm}-${dd} ${hh}:${min}:${sec}`;
  }

  /**
   * Set Sentry scope context by key.
   * @param {string} key - 'tags', 'extra', or 'user'
   * @param {object} value
   * @private
   */
  static _mergeContext(key, value) {
    if (key === 'tags') {
      Object.keys(value).forEach(k => Sentry.setTag(k, value[k]));
    } else if (key === 'extra') {
      Object.keys(value).forEach(k => Sentry.setExtra(k, value[k]));
    } else if (key === 'user') {
      Sentry.setUser(value);
    }
  }

}

module.exports = Log;
