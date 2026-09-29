/**
 * @file Edge module
 * @description The 2.x data-plane transport between two processes.
 *
 *   An `Edge` moves Information Packets from an outport to an inport
 *   through a pair of Web Streams, providing native backpressure.
 *   The high-water mark is resolved hierarchically at graph
 *   initialization time (edge metadata, then component default, then
 *   runtime global) and applied as an admission policy on writes:
 *
 *   - `0` — synchronous: every write's Promise resolves only once the
 *     consumer has taken the packet
 *   - positive integer `n` — the first `n` in-flight writes resolve
 *     immediately; further writes wait until earlier packets have been
 *     delivered (consumed by the receiving side)
 *   - `null` (or absent) — unbounded, fire-and-forget writes matching
 *     1.x behavior exactly
 *
 *   `observe(callback)` registers a synchronous middleware that sees
 *   every IP before it enters the stream — the hook for `fbp-protocol`
 *   and Flowtrace.
 *
 *   IPs are atomic; bracket streams are validated so that substream
 *   integrity holds across the stream boundary.
 */

/**
 * Validate a configured high-water mark value.
 *
 * @param {any} value
 * @param {string} source - For error messages
 * @returns {number}
 */
function validateHighWaterMark(value, source) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(
      `Edge highWaterMark from ${source} must be a non-negative integer or null, got ${value}`,
    );
  }
  return value;
}

/**
 * Resolve the high-water mark for an edge, hierarchically: edge metadata
 * wins over the component-level default, which wins over the runtime
 * global. `null`/absent everywhere means unbounded.
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
  if (fromMetadata !== undefined && fromMetadata !== null) {
    return validateHighWaterMark(fromMetadata, "edge metadata");
  }
  if (componentDefault !== undefined && componentDefault !== null) {
    return validateHighWaterMark(componentDefault, "component default");
  }
  if (runtimeDefault !== undefined && runtimeDefault !== null) {
    return validateHighWaterMark(runtimeDefault, "runtime default");
  }
  // TODO(noflo 2.0): flip the absent-everywhere default from unbounded to a
  // small bounded value (e.g. 16) so backpressure is on by default, per the
  // decision recorded in work document #1 ("Transitioning Dataflow to Web
  // Streams", update #2). Graphs relying on unbounded buffering must then
  // opt out explicitly with `highWaterMark: null`.
  return null;
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

    /** @type {ReadableStreamDefaultController<any>|null} */
    let readableController = null;
    /** @type {(() => void) | null} */
    this.pendingSinkCompletion = null;

    const strategy = undefined;
    void strategy;

    this.readableStream = new ReadableStream({
      start(controller) {
        readableController = controller;
      },
      cancel(reason) {
        void reason;
      },
    });

    const self = this;
    this.writableStream = new WritableStream({
      // The sink defers completion until the delivery handler has
      // released the IP, so the writer-side queue reflects undelivered
      // packets. Admission pacing lives in write() instead.
      write(ip) {
        if (self.highWaterMark === null) {
          readableController.enqueue(ip);
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          self.pendingSinkCompletion = resolve;
          readableController.enqueue(ip);
        });
      },
      abort(reason) {
        readableController.error(reason);
      },
    });

    this.writer = this.writableStream.getWriter();
    const reader = this.readableStream.getReader();
    this.reader = reader;
    this.pumpPromise = this.#pump(reader);
  }

  /**
   * Consume the readable side, delivering each IP to the registered
   * handler. If the handler returns a Promise, the pump waits for it
   * before reading the next IP — consumer-paced backpressure. Handler
   * exceptions are routed to the registered error handler so the
   * engine's escalation chain stays in control.
   *
   * @param {ReadableStreamDefaultReader<any>} reader
   */
  async #pump(reader) {
    for (;;) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        if (this.deliver) {
          const release = this.deliver(value);
          if (release && typeof release.then === "function") {
            await release;
          }
        }
        // Complete the sink write for this IP and admit parked writers
        this.#delivered();
      } catch (error) {
        if (this.onError) {
          this.onError(error);
          return;
        }
        this.lastError = error;
        return;
      }
    }
  }

  /**
   * Register the error handler invoked when delivery throws. Without
   * one, the error is recorded and delivery stops.
   *
   * @param {(error: any) => void} handler
   * @returns {this}
   */
  onErrorDelivery(handler) {
    this.onError = handler;
    return this;
  }

  /**
   * Mark one admitted IP as delivered: complete its sink write and wake
   * a parked writer if any.
   */
  #delivered() {
    const completion = this.pendingSinkCompletion;
    this.pendingSinkCompletion = null;
    if (completion) {
      completion();
    }
    if (this.highWaterMark !== null) {
      this.inFlight -= 1;
      const next = this.waitingWriters.shift();
      if (next) {
        this.inFlight += 1;
        next.resolve();
      }
    }
  }

  /**
   * Register the delivery handler invoked for each IP arriving on the
   * readable side. At most one handler is active.
   *
   * @param {(ip: any) => void | Promise<void>} handler
   * @returns {this}
   */
  onDelivery(handler) {
    this.deliver = handler;
    return this;
  }

  /**
   * Register an observation middleware. Observers run synchronously,
   * in registration order, before an IP enters the stream. Each observer
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
   * Track bracket stream integrity across the stream boundary.
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
    const observers = this.observers;

    // Unbounded edges use a synchronous fast path: delivery happens
    // during the write call itself, preserving the 1.x fire-and-forget
    // timing exactly. Streams stay idle.
    if (this.highWaterMark === null) {
      const fastDeliver = () => {
        if (this.deliver) {
          const release = this.deliver(ip);
          void release;
        }
      };
      if (!observers.length) {
        fastDeliver();
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        /**
         * @param {number} index
         */
        const runObserver = (index) => {
          if (index >= observers.length) {
            fastDeliver();
            resolve();
            return;
          }
          observers[index](ip, () => runObserver(index + 1));
        };
        runObserver(0);
      });
    }

    /**
     * @param {() => void} resolve
     * @param {(err: Error) => void} reject
     */
    const admitted = (resolve, reject) => {
      // Unbounded and zero-HWM writes resolve with the sink: immediately
      // for unbounded, on delivery for zero. Bounded writes with capacity
      // resolve on admission, tracking delivery separately.
      if (this.highWaterMark !== null && this.highWaterMark > 0) {
        this.writer.write(ip).then(null, (error) => {
          this.lastError = error;
        });
        resolve();
        return;
      }
      this.writer.write(ip).then(
        () => resolve(),
        (error) => {
          this.lastError = error;
          reject(error);
        },
      );
    };

    if (!observers.length) {
      return this.#admission().then(
        () => new Promise(admitted),
        (error) => Promise.reject(error),
      );
    }
    return this.#admission().then(
      () =>
        new Promise((resolve, reject) => {
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
        }),
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
   * Close the edge for writing. The delivery pump finishes with the
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
    return this.writer.close();
  }
}
