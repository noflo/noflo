/**
 * @noflo/assembly-utils - Assembly adapter components for NoFlo
 * Write a value into a field of an assembly message.
 * SPDX-License-Identifier: MIT
 */
/* @ts-self-types="./ToField.d.ts" */
import Component from "@noflo/assembly";

/**
 * Writes a value into a field of an assembly message — the inverse of
 * `ExtractField`. The field name comes from the graph node's `field`
 * metadata, which the loader passes to `getComponent`.
 */
export class ToField extends Component {
  /**
   * @param {{ field?: string }} [metadata]
   */
  constructor(metadata = {}) {
    super({
      description: "Write a value into a field of an assembly message",
      icon: "sign-in",
      inPorts: {
        msg: {
          datatype: "object",
          description: "Assembly message to write into",
          required: true,
        },
        value: {
          datatype: "all",
          description: "Value to write",
          required: true,
        },
      },
      outPorts: {
        out: {
          datatype: "object",
          description: "The message with the field written",
        },
      },
    });
    this.field = metadata?.field;
  }

  processMessage(input, output) {
    if (!this.field) {
      output.done(new Error("ToField requires the field metadata"));
      return;
    }
    if (!input.hasData("msg", "value")) {
      return;
    }
    const [msg, value] = input.getData("msg", "value");
    output.sendDone({
      out: { ...msg, [this.field]: value },
    });
  }
}

export const getComponent = (/** @type {{ field?: string }} */ metadata) =>
  new ToField(metadata);
