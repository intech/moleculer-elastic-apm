'use strict'

const APM = require('elastic-apm-node')

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
      this.spans[payload.id] = this.apm.startSpan(this.getSpanName(payload), this.getSpanType(payload))
      if (!payload.parent) {
        this.apm.startTransaction(this.getSpanName(payload), this.getType(payload))
        if(payload.meta) this.apm.setUserContext(payload.meta)
        if(payload.params) this.apm.setCustomContext(payload.params)
      }
    },

    /**
     * Metric event end span
     *
     * @param {Object} payload
     */
    'metrics.trace.span.finish' (payload) {
      if (this.spans[payload.id]) {
        this.spans[payload.id].end()
        delete this.spans[payload.id]
      }
      if (!payload.parent) this.apm.endTransaction()
      delete this.requests[payload.id]
    }
  },

  /**
   * Methods
   */
  methods: {

    /**
     * Get span type from metric event. By default it returns the action node path
     *
     * @param {Object} metric
     * @returns  {String}
     */
    getSpanType (metric) {
      let type = []
      if(metric.hasOwnProperty('parentID')) type.push(metric.parentID)
      if(metric.hasOwnProperty('callerNodeID')) type.push(metric.callerNodeID)
      if(metric.hasOwnProperty('nodeID')) type.push(metric.nodeID)
      return type.join('⇄')
    },

    /**
     * Get span name from metric event. By default it returns the action name
     *
     * @param {Object} metric
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
    getType (metric) {
      let type = 'request'
      if (metric.fromCache) type += '.cache'
      if (metric.remoteCall) type += '.remote'
      if (metric.error) type = '.error'
      return type
    }
  },

  /**
   * Service created lifecycle event handler
   *
   */
  created () {
    // TODO: check already started
    // PR: https://github.com/elastic/apm-agent-nodejs/pull/311
    try {
      this.apm = APM.start(this.settings)
    } catch(e) {
      this.apm = APM
    }
    this.requests = {}
    this.spans = {}
  }
}
