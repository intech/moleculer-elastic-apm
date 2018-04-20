'use strict'

const apm = require('elastic-apm-node')

/**
 * Service metric traces to the Elastic APM.
 *
 * @name moleculer-elastic-apm
 * @module Service
 */
module.exports = {

  name: 'elastic-apm',

  /**
   * Default settings for APM
   */
  settings: {
    serviceName: 'Moleculer',
    serverUrl: 'http://localhost:8200',
    captureBody: 'all',
    errorOnAbortedRequests: true
  },

  /**
   * Events
   */
  events: {

    /**
     * Metric event start span
     *
     * @param {Object} payload
     */
    'metrics.trace.span.start' (payload) {
      this.requests[payload.id] = payload
      this.spans[payload.id] = apm.startSpan(this.getSpanName(payload), 'broker')
      if (!payload.parent) apm.startTransaction(this.getSpanName(payload), this.getType(payload))
    },

    /**
     * Metric event end span
     *
     * @param {Object} payload
     */
    'metrics.trace.span.finish' (payload) {
      if (this.spans[payload.id]) {
        let item = this.requests[payload.id]
        Object.assign(item, payload)
        if (item.meta.apiKey) apm.setTag('apiKey', item.meta.apiKey)
        this.spans[payload.id].end()
      }

      if (!payload.parent) apm.endTransaction()
      delete this.requests[payload.id]
    }
  },

  /**
   * Methods
   */
  methods: {

    /**
     * Get span name from metric event. By default it returns the action name
     *
     * @param {Object} span
     * @returns  {String}
     */
    getSpanName (metric) {
      if (metric.name) return metric.name
      if (metric.action) return metric.action.name
      return 'unnamed'
    },

    /**
     * Get span type from metric event. By default 'request'
     *
     * @param {Object} span
     * @returns  {String}
     */
    getType (span) {
      let type = 'request'
      if (span.fromCache) type += '.cache'
      if (span.remoteCall) type += '.remote'
      if (span.error) type = '.error'
      return type
    }
  },

  /**
   * Service created lifecycle event handler
   *
   */
  created () {
    this.requests = {}
    this.spans = {}
  }
}
