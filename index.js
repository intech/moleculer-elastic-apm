'use strict'

const opentracing = require('opentracing')
const APM = require('elastic-apm-node')
const Tracer = require('elastic-apm-node-opentracing')
const SpanContext = require('elastic-apm-node-opentracing/lib/span_context')
const Int64 = require('node-int64')

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
    apm: {
      // captureBody: 'all',
      // errorOnAbortedRequests: true,
      // captureExceptions: false,
      serverUrl: 'http://localhost:8200',
    }
  },

  /**
   * Events
   */
  events: {
    /**
     * Metric event end span
     *
     * @param {Object} metric
     */
    'metrics.trace.span.finish' (metric) {
      this.makePayload(metric)
    }
  },

  /**
   * Methods
   */
  methods: {
    /**
     * Create payload from metric event
     *
     * @param {Object} metric
     */
    makePayload (metric) {
      const serviceName = this.getServiceName(metric)
      const tracer = this.getTracer(serviceName)

      let parentCtx
      if (metric.parent) {
        parentCtx = new SpanContext(
          this.convertID(metric.requestID), // traceId,
          this.convertID(metric.parent), // spanId,
          null, // parentId,
          null, // traceIdStr
          null, // spanIdStr
          null, // parentIdStr
          1, // flags
          {}, // baggage
          '', // debugId
        )
      }
  
      const span = tracer.startSpan(this.getSpanName(metric), {
        startTime: metric.startTime,
        childOf: parentCtx,
        tags: {
          nodeID: metric.nodeID,
          level: metric.level,
          remoteCall: metric.remoteCall,
        }
      })
      this.addTags(span, 'service', serviceName)
      if (metric.action && metric.action.name) {
        this.addTags(span, 'action', metric.action.name)
      }

      this.addTags(
        span,
        opentracing.Tags.SPAN_KIND,
        opentracing.Tags.SPAN_KIND_RPC_SERVER,
      )

      const sc = span.context()
      sc.traceId = this.convertID(metric.requestID)
      sc.spanId = this.convertID(metric.id)

      if (metric.callerNodeID) {
        this.addTags(span, 'callerNodeID', metric.callerNodeID)
      }

      if (metric.params) {
        this.addTags(span, 'params', metric.params)
      }

      if (metric.meta) {
        this.addTags(span, 'meta', metric.meta)
      }

      if (metric.error) {
        // span.log({ event: 'error', 'error.object': metric.error, metric.error.message }, Date.now())
        this.addTags(span, opentracing.Tags.ERROR, true)
        this.addTags(span, 'error.message', metric.error.message)
        this.addTags(span, 'error.type', metric.error.type)
        this.addTags(span, 'error.code', metric.error.code)

        if (metric.error.data) {
          this.addTags(span, 'error.data', metric.error.data)
        }

        if (metric.error.stack) {
          this.addTags(span, 'error.stack', metric.error.stack.toString())
        }
      }
  
      span.finish(metric.endTime)
    },
  
    /**
     * Get service name from metric event
     *
     * @param {Object} metric
     * @returns {String}
     */
    getServiceName (metric) {
      if (metric.service) {
        return metric.service.name ? metric.service.name : metric.service
      }
    
      const parts = metric.action.name.split('.')
      parts.pop()
      return parts.join('.')
    },
  
    /**
     * Add tags to span
     *
     * @param {Object} span
     * @param {String} key
     * @param {any} value
     * @param {String?} prefix
     */
    addTags (span, key, value, prefix) {
      const name = prefix ? `${prefix}.${key}` : key
      if (typeof value === 'object') {
        Object.keys(value).forEach(k => this.addTags(span, k, value[k], name))
      } else {
        span.setTag(name, value)
      }
    },
  
    /**
     * Convert Context ID to Zipkin format
     *
     * @param {String} id
     * @returns {String}
     */
    convertID (id) {
      if (id) {
        return new Int64(id.replace(/-/g, '').substring(0, 16)).toBuffer()
      }
      return null
    },
  
    /**
     * Get a tracer instance by service name
     *
     * @param {any} serviceName
     * @returns {Jaeger.Tracer}
     */
    getTracer (serviceName) {
      if (this.tracers[serviceName]) return this.tracers[serviceName]
    
      this.settings.apm.captureExceptions = false
      const agent = APM.isStarted() ? APM : APM.start(this.settings.apm)
      const tracer = new Tracer(agent)
      this.tracers[serviceName] = tracer
    
      return tracer
    },

    /**
     * Get span type from metric event. By default it returns the action node path
     *
     * @param {Object} metric
     * @returns  {String}
     */
    getSpanType (metric) {
      const type = []
      if (metric.hasOwnProperty('parentID')) type.push(metric.parentID)
      if (metric.hasOwnProperty('callerNodeID')) type.push(metric.callerNodeID)
      if (metric.hasOwnProperty('nodeID')) type.push(metric.nodeID)
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
    this.tracers = {}
  },
  
  /**
   * Service stopped lifecycle event handler
   */
  stopped () {
    // Object.keys(this.tracers).forEach(service => {
    //   this.tracers[service].close()
    // })
    this.tracers = {}
  }
}
