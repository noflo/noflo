/**
 * NoFlo - Flow-Based Programming for JavaScript
 * (c) 2021-2026 Henri Bergius
 * (c) 2013-2020 Flowhub UG
 * (c) 2011-2012 Henri Bergius, Nemein
 * NoFlo may be freely distributed under the MIT license
 *
 * @file Edge module
 * @description The 2.x data-plane transport between two processes.
 *
 *   An `Edge` moves Information Packets from an outport to an inport with
 *   native backpressure. The high-water mark is resolved hierarchically
 *   at graph initialization time (edge metadata, then component default,
 *   then runtime global) and applied as an admission policy on writes:
 *
 *   - `0` — synchronous: every write's Promise resolves only once the
 *     consumer has taken the packet
 *   - positive integer `n` — the first `n` in-flight writes resolve
 *     immediately; further writes wait until earlier packets have been
 *     delivered (consumed by the receiving side)
 *   - `null` — explicit opt-out: unbounded, fire-and-forget writes matching
 *     1.x behavior
 *
 *   When no level configures a value, the resolved default is bounded
 *   (`DEFAULT_HIGH_WATER_MARK`), so backpressure is on by default in 2.x.
 *
 *   The write side is a Web Streams `WritableStream`, so writers observe
 *   the same backpressure semantics as any stream consumer. Delivery is
 *   invoked synchronously from the sink: NoFlo's error escalation relies
 *   on listener exceptions reaching the sender, and a resident pump would
 *   leave dangling reads that hang test-runner finalization.
 *
 *   `observe(callback)` registers a synchronous middleware that sees
 *   every IP before it is delivered — the hook for `fbp-protocol` and
 *   Flowtrace. IPs are atomic; bracket streams are validated so that
 *   substream integrity holds across the transport.
 */
/* @ts-self-types="./Edge.d.ts" */

/**
 * Validate a configured high-water mark value. Explicit `null` is valid and
 * means unbounded (the 1.x behavior opt-out).
 *
 * @param {any} value
 * @param {string} source - For error messages
 * @returns {number|null}
 */
function validateHighWaterMark(value, source) {
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(
      `Edge highWaterMark from ${source} must be a non-negative integer or null, got ${value}`,
    );
  }
  return value;
}

/**
 * The resolved default for edges whose configuration leaves the
 * high-water mark absent at every level. Small enough to keep latency
 * low, large enough to let synchronous producer/consumer chains proceed
 * without per-packet rendezvous.
 */
export const DEFAULT_HIGH_WATER_MARK = 16;

/**
 * Resolve the high-water mark for an edge, hierarchically: edge metadata
 * wins over the component-level default, which wins over the runtime
 * global. An explicit `null` at any level opts that edge out of
 * backpressure (unbounded); only absence at every level resolves to the
 * bounded default.
 *
 * @param {Record<string, any>|undefined} [metadata] - Graph edge metadata
 * @param {number|null|undefined} [componentDefault] - Port/component default
 * @param {number|null|undefined} [runtimeDefault] - Network-level global
 * @returns {number|null} Resolved high-water mark, or null for unbounded
 */
export function resolveHighWaterMark(
  metadata,
  componentDefault,
  runtimeDefault,
) {
  const fromMetadata = metadata ? metadata.highWaterMark : undefined;
  if (fromMetadata !== undefined) {
    return validateHighWaterMark(fromMetadata, "edge metadata");
  }
  if (componentDefault !== undefined) {
    return validateHighWaterMark(componentDefault, "component default");
  }
  if (runtimeDefault !== undefined) {
    return validateHighWaterMark(runtimeDefault, "runtime default");
  }
  return DEFAULT_HIGH_WATER_MARK;
}

/**
 * @typedef {Object} EdgeOptions
 * @property {number|null} [highWaterMark] - Resolved high-water mark; null = unbounded
 */

export class Edge {
  /**
   * @param {EdgeOptions} [options]
   */
  constructor(options = {}) {
    /** @type {number|null} */
    this.highWaterMark =
      options.highWaterMark === undefined || options.highWaterMark === null
        ? null
        : validateHighWaterMark(options.highWaterMark, "options");

    /** @type {((ip: any, next: () => void) => void)[]} */
    this.observers = [];
    /** @type {any} */
    this.lastError = null;
    /** @type {boolean} */
    this.closed = false;

    /** Number of admitted-but-undelivered IPs (bounded edges only) */
    this.inFlight = 0;
    /** Writers parked waiting for delivery capacity */
    /** @type {{ resolve: () => void, reject: (err: Error) => void }[]} */
    this.waitingWriters = [];
    /** IPs written but not yet handed to the delivery handler */
    this.pendingDeliveries = 0;
    /** @type {(() => void)[]} */
    this.drainResolvers = [];

    const self = this;
    if (this.highWaterMark !== null) {
      // Bounded edges get the stream machinery for admission-paced
      // delivery. Unbounded edges (the 1.x default) stay allocation-free:
      // their writes take the synchronous fast path and never touch it.
      this.writableStream = new WritableStream({
        // Delivery runs one microtask after the write call, matching the
        // pump design's timing: the sending side's bookkeeping settles
        // before the receiving side's cascade begins. The sink completes
        // once the delivery handler has released the IP, so the
        // writer-side queue reflects undelivered packets.
        write(ip) {
          return Promise.resolve().then(() => {
            let release = null;
            try {
              if (self.deliver) {
                release = self.deliver(ip);
              }
            } catch (error) {
              // Delivery-handler exceptions escalate through the registered
              // error handler — the bounded-path equivalent of the
              // synchronous throw the unbounded fast path propagates to
              // the sender. Bookkeeping stays consistent either way.
              self.#markDelivered();
              self.#released();
              if (self.onError) {
                self.onError(error);
                return;
              }
              self.lastError = error;
              return;
            }
            self.#markDelivered();
            const finish = () => {
              self.#released();
            };
            if (release && typeof release.then === "function") {
              // Returning the release promise keeps the sink (and this
              // write) pending until the delivery handler releases the IP
              return release.then(
                () => finish(),
                () => finish(),
              );
            }
            finish();
          });
        },
        abort(reason) {
          self.lastError = reason;
        },
      });

      this.writer = this.writableStream.getWriter();
    }
  }

  /**
   * Settle one reserved delivery slot: decrement the pending count and
   * resolve any drain waiters once the edge is fully drained. Called when
   * an IP has been handed to the delivery handler, and on the rejection
   * paths of a write that never delivers.
   */
  #markDelivered() {
    this.pendingDeliveries -= 1;
    if (this.pendingDeliveries > 0) {
      return;
    }
    const resolvers = this.drainResolvers;
    this.drainResolvers = [];
    for (const resolver of resolvers) {
      resolver();
    }
  }

  /**
   * Resolve once every IP written to the edge has been handed to the
   * delivery handler. Resolves immediately when nothing is pending.
   *
   * @returns {Promise<void>}
   */
  whenDrained() {
    if (this.pendingDeliveries <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }

  /**
   * Deliver one IP to the registered handler. If the handler returns a
   * Promise, the completion link is registered so that the release
   * (delivery consumed) frees writer capacity.
   * Handler exceptions propagate synchronously to the caller.
   *
   * @param {any} ip
   */
  #deliver(ip) {
    if (this.deliver) {
      const release = this.deliver(ip);
      if (release && typeof release.then === "function") {
        release.then(
          () => this.#released(),
          () => this.#released(),
        );
        return;
      }
      this.#released();
    }
  }

  /**
   * Mark delivery as consumed: decrement in-flight count and admit a
   * parked writer if one is waiting.
   */
  #released() {
    if (this.highWaterMark === null) {
      return;
    }
    this.inFlight -= 1;
    const next = this.waitingWriters.shift();
    if (next) {
      this.inFlight += 1;
      next.resolve();
    }
    const completion = this.pendingSinkCompletion;
    this.pendingSinkCompletion = null;
    if (completion) {
      completion();
    }
  }

  /**
   * Register the delivery handler invoked for each IP entering the edge.
   * At most one handler is active. If the handler returns a Promise, the
   * IP is considered delivered only once that Promise resolves
   * (consumer-paced backpressure).
   *
   * @param {(ip: any) => void | Promise<void>} handler
   * @returns {this}
   */
  onDelivery(handler) {
    this.deliver = handler;
    return this;
  }

  /**
   * Register the error handler invoked when delivery throws. Without
   * one, the error is recorded on the edge and delivery stops.
   *
   * @param {(error: any) => void} handler
   * @returns {this}
   */
  onErrorDelivery(handler) {
    this.onError = handler;
    return this;
  }

  /**
   * Register an observation middleware. Observers run synchronously,
   * in registration order, before an IP is delivered. Each observer
   * receives the IP and a `next()` to continue the chain.
   *
   * @param {(ip: any, next: () => void) => void} callback
   * @returns {this}
   */
  observe(callback) {
    this.observers.push(callback);
    return this;
  }

  /**
   * Track bracket stream integrity across the transport.
   *
   * @param {any} ip
   */
  #validateBrackets(ip) {
    if (!ip || typeof ip !== "object") {
      return;
    }
    if (ip.type === "openBracket") {
      this.bracketDepth = (this.bracketDepth || 0) + 1;
      return;
    }
    if (ip.type === "closeBracket") {
      this.bracketDepth = (this.bracketDepth || 0) - 1;
      if (this.bracketDepth < 0) {
        this.bracketDepth = 0;
        throw new Error(
          "Edge received a closeBracket without a matching openBracket",
        );
      }
    }
  }

  /**
   * Write an IP into the edge. The returned Promise resolves when the
   * write is admitted per the high-water mark: immediately for
   * unbounded edges and while capacity remains for bounded ones; once
   * the packet has been consumed for `highWaterMark: 0`.
   *
   * @param {any} ip
   * @returns {Promise<void>}
   */
  write(ip) {
    if (this.closed) {
      return Promise.reject(new Error("Edge is closed for writing"));
    }
    try {
      this.#validateBrackets(ip);
    } catch (error) {
      return Promise.reject(error);
    }

    // Unbounded edges (the 1.x default) deliver synchronously during the
    // write call, preserving legacy timing exactly.
    if (this.highWaterMark === null) {
      const deliverSync = () => {
        if (this.deliver) {
          const release = this.deliver(ip);
          if (release && typeof release.then === "function") {
            release.then(
              () => this.#released(),
              () => this.#released(),
            );
          }
        }
      };
      const observers = this.observers;
      if (!observers.length) {
        deliverSync();
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        /**
         * @param {number} index
         */
        const runObserver = (index) => {
          if (index >= observers.length) {
            deliverSync();
            resolve();
            return;
          }
          observers[index](ip, () => runObserver(index + 1));
        };
        runObserver(0);
      });
    }

    // Reserve the delivery slot synchronously: a disconnect() in the
    // same tick as the write (e.g. post's autoDisconnect) must observe
    // the packet as in flight and defer its event until after delivery.
    // Every rejection path releases the reservation — a write that never
    // delivers must not wedge whenDrained().
    this.pendingDeliveries += 1;
    const unreserve = () => {
      this.#markDelivered();
    };

    const observers = this.observers;
    /**
     * @param {() => void} resolve
     * @param {(err: Error) => void} reject
     */
    const admitted = (resolve, reject) => {
      // Bounded edges with capacity: resolve the writer on admission;
      // delivery completion is tracked separately. Zero resolves on
      // delivery. Write rejections release the reservation.
      if (this.highWaterMark > 0) {
        this.writer.write(ip).then(null, (error) => {
          this.lastError = error;
          unreserve();
        });
        resolve();
        return;
      }
      this.writer.write(ip).then(
        () => resolve(),
        (error) => {
          this.lastError = error;
          unreserve();
          reject(error);
        },
      );
    };

    /**
     * @param {() => void} resolve
     * @param {(err: Error) => void} reject
     */
    const admittedThroughObservers = (resolve, reject) => {
      /**
       * @param {number} index
       */
      const runObserver = (index) => {
        if (index >= observers.length) {
          admitted(resolve, reject);
          return;
        }
        observers[index](ip, () => runObserver(index + 1));
      };
      runObserver(0);
    };

    return this.#admission().then(
      () => new Promise(observers.length ? admittedThroughObservers : admitted),
      (error) => {
        unreserve();
        return Promise.reject(error);
      },
    );
  }

  /**
   * Admission control per the resolved high-water mark.
   *
   * @returns {Promise<void>}
   */
  #admission() {
    if (this.highWaterMark === null) {
      return Promise.resolve();
    }
    if (this.highWaterMark === 0) {
      // Synchronous: the write goes straight through and resolves on
      // delivery via the deferred sink — no admission buffering
      return Promise.resolve();
    }
    if (this.inFlight < this.highWaterMark) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.waitingWriters.push({ resolve, reject });
    });
  }

  /**
   * Current backpressure signal: how many more IPs can be admitted
   * before writers should wait. Positive means room available.
   *
   * @returns {number|null}
   */
  desiredSize() {
    if (this.highWaterMark === null) {
      return Infinity;
    }
    return this.highWaterMark - this.inFlight;
  }

  /**
   * Close the edge for writing. The delivery handler finishes with the
   * remaining IPs.
   *
   * @returns {Promise<void>}
   */
  close() {
    this.closed = true;
    const parked = this.waitingWriters;
    this.waitingWriters = [];
    for (const waiter of parked) {
      waiter.reject(new Error("Edge is closed for writing"));
    }
    if (this.writer) {
      return this.writer.close();
    }
    return Promise.resolve();
  }
}
