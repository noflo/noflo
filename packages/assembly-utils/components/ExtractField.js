/**
 * @noflo/assembly-utils - Assembly adapter components for NoFlo
 * Extract a field from an assembly message.
 * SPDX-License-Identifier: MIT
 */
/* @ts-self-types="./ExtractField.d.ts" */
import Component from "@noflo/assembly";

/**
 * Extracts a field from an assembly message and sends its value — the
 * inport-side adapter the `asAssembly` generated graphs wire between the
 * message fanout and the inner component's inports.
 *
 * The field name comes from the graph node's `assembly.field` metadata
 * (the assembly catalog's config key), which the
 * loader passes to `getComponent`.
 *
 * The field may be a dot path: segments split on `.`, each walked as a
 * plain own-property read — `frontmatter.head` reads `msg.frontmatter`
 * then its `head`. An absent segment at any level is the same malformed
 * message the flat mapping reports: the error names the full mapped
 * path. An intermediate value that is not an object (a primitive, an
 * array element walk is not supported) is the same absence.
 *
 * A message that lacks the mapped field is malformed for this adapter:
 * the absence surfaces as an error on the `error` port — which the
 * generated graph wires into the collector's error accumulation, so the
 * message completes on the error leg with the failure recorded — instead
 * of a silent `undefined` delivery the inner component would crash on.
 * A field that is present with a `null` value is a value and delivers.
 * (Work document #35 update #13, question (b).)
 */
export class ExtractField extends Component {
  /**
   * @param {{ field?: string }} [metadata]
   */
  constructor(metadata = {}) {
    super({
      description: "Extract a field from an assembly message",
      icon: "sign-out",
      inPorts: {
        msg: {
          datatype: "object",
          description: "Assembly message",
          required: true,
        },
      },
      outPorts: {
        out: {
          datatype: "all",
          description: "The field value",
        },
        error: {
          datatype: "object",
          description: "The message lacked the mapped field",
          required: false,
        },
      },
    });
    this.field = metadata?.["assembly.field"];
  }

  processMessage(input, output) {
    if (!this.field) {
      output.done(new Error("ExtractField requires the field metadata"));
      return;
    }
    if (!input.hasData("msg")) {
      return;
    }
    const msg = input.getData("msg");
    if (typeof msg !== "object" || msg === null) {
      // A kind envelope instead of a framework TypeError: the absence
      // guard needs an object to introspect
      output.done(
        new Error(
          `ExtractField: the assembly message is not an object, cannot extract '${this.field}'`,
        ),
      );
      return;
    }
    // Dot-path walk: segments split on `.`, each an own-property read.
    // A single-segment path behaves exactly like the flat mapping
    const segments = this.field.split(".");
    /** @type {unknown} */
    let value = msg;
    for (const segment of segments) {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        !Object.hasOwn(value, segment)
      ) {
        // Absent path: the message is malformed for this adapter. The
        // error leg is the honest signal — the generated graph wires this
        // port into the collector's error accumulation, so the message
        // completes with the failure recorded instead of a silent
        // undefined delivery crashing the inner component
        output.done(
          new Error(
            `ExtractField: the message lacks the mapped field '${this.field}'`,
          ),
        );
        return;
      }
      value = /** @type {Record<string, unknown>} */ (value)[segment];
    }
    // Extraction is deliberately tolerant of failed messages: errors
    // accumulate in the envelope and the inner component's own wrapper
    // decides how to handle them. A present-but-null value is a value
    // and delivers
    output.sendDone({ out: value });
  }
}

/**
 * ExtractField component factory: the loader instantiates the component
 * for a graph node, passing the node's `assembly.field` metadata through.
 *
 * @param {{ field?: string }} [metadata] The node's `assembly.field` metadata.
 * @returns {ExtractField} The component instance.
 */
export function getComponent(metadata) {
  return new ExtractField(metadata);
}
