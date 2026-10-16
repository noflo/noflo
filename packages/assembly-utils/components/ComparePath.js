/**
 * @noflo/assembly-utils - Assembly adapter components for NoFlo
 * Compare a message value resolved by a JSONPath expression against a threshold and route pass/fail.
 * SPDX-License-Identifier: MIT
 */
/* @ts-self-types="./ComparePath.d.ts" */

import Component, { fail } from "@noflo/assembly";
import { JSONPath } from "jsonpath-plus";

/**
 * ComparePath — the Assembly Line base class for components whose message
 * handling is driven by comparing paths: subclasses implement `relay` and
 * the base class routes per-path streams, scopes, and error handling.
 */
export class ComparePath extends Component {
  constructor() {
    super({
      description:
        "Compare an object value extracted with a JSONPath expression",
      icon: "check",
      inPorts: {
        in: {
          datatype: "object",
          description: "Object to query",
          required: true,
        },
        path: {
          datatype: "string",
          description: "JSONPath expression",
          required: true,
          control: true,
        },
        comparison: {
          datatype: "number",
          description: "Value to compare against",
          required: true,
          control: true,
        },
        operator: {
          datatype: "string",
          description: "Comparison operator",
          control: true,
          default: "==",
          values: ["==", "!=", ">", "<", ">=", "<="],
        },
      },
      outPorts: {
        pass: {
          datatype: "object",
          description: "Object that passed the comparison",
        },
        fail: {
          datatype: "object",
          description: "Object that failed the comparison",
        },
      },
    });
  }

  processMessage(input, output) {
    if (!input.hasData("in", "path", "comparison", "operator")) {
      return;
    }
    const [msg, path, comparison, operator] = input.getData(
      "in",
      "path",
      "comparison",
      "operator",
    );
    if (!this.validate(msg)) {
      output.sendDone({
        fail: msg,
      });
      return;
    }

    let result;
    try {
      // jsonpath-plus resolves the query to a list of matches; the
      // comparison targets the first one
      // wrap:false makes jsonpath-plus return the matched value directly
      result = JSONPath({ path, json: msg, wrap: false });
    } catch (e) {
      output.sendDone({
        fail: fail(msg, e),
      });
      return;
    }

    let passed = false;
    switch (operator) {
      case "==": {
        // Loose equality is the documented semantic: string "42" compares
        // equal to number 42, matching the 1.x eval-based implementation
        // biome-ignore lint/suspicious/noDoubleEquals: documented above
        passed = result == comparison;
        break;
      }
      case "!=": {
        passed = result !== comparison;
        break;
      }
      case ">": {
        passed = result > comparison;
        break;
      }
      case "<": {
        passed = result < comparison;
        break;
      }
      case ">=": {
        passed = result >= comparison;
        break;
      }
      case "<=": {
        passed = result <= comparison;
        break;
      }
      // No default branch: the operator port declares its values, so
      // unknown operators are rejected at the port before firing
    }
    if (passed) {
      output.sendDone({
        pass: msg,
      });
      return;
    }
    output.sendDone({
      fail: msg,
    });
  }
}

/**
 * ComparePath component factory.
 */
export function getComponent() {
  return new ComparePath();
}
