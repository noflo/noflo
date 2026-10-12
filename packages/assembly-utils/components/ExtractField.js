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
 * The field name comes from the graph node's `field` metadata, which the
 * loader passes to `getComponent`.
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
      },
    });
    this.field = metadata?.field;
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
    // Extraction is deliberately tolerant of failed messages: errors
    // accumulate in the envelope and the inner component's own wrapper
    // decides how to handle them
    output.sendDone({ out: msg[this.field] });
  }
}

export const getComponent = (/** @type {{ field?: string }} */ metadata) =>
  new ExtractField(metadata);
