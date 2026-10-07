/**
 * @file nativeGraph module
 * @description Spec helper over the native `@noflo/graph` model: the
 *   concise, chainable mutator style the fbp-graph-era specs were written
 *   in, backed by a real `GraphModel`. Test-only sugar — the library API
 *   stays object-based. Shadowed methods (addNode, addEdge, removeEdge,
 *   removeNode) accept both the native object shape — as the engine calls
 *   them during live-edit mirroring — and the concise positional shape.
 */

import { GraphModel } from "@noflo/graph";

/**
 * @param {string} [name]
 * @returns {GraphModel}
 */
export function nativeGraph(name) {
  const model = new GraphModel(name === undefined ? {} : { name });

  const modelAddNode = model.addNode.bind(model);
  const modelAddEdge = model.addEdge.bind(model);
  const modelRemoveEdge = model.removeEdge.bind(model);
  const modelRemoveNode = model.removeNode.bind(model);

  /**
   * @param {any} nodeNameOrDefinition
   * @param {any} [component]
   * @param {any} [metadata]
   */
  model.addNode = (nodeNameOrDefinition, component, metadata) => {
    if (typeof nodeNameOrDefinition === "object") {
      return modelAddNode(nodeNameOrDefinition);
    }
    modelAddNode({
      entity_id: nodeNameOrDefinition,
      component,
      ...(metadata === undefined ? {} : { metadata }),
    });
    return model;
  };

  /**
   * @param {any} fromOrDefinition
   * @param {any} [fromPort]
   * @param {any} [toNode]
   * @param {any} [toPort]
   * @param {any} [metadata]
   */
  model.addEdge = (fromOrDefinition, fromPort, toNode, toPort, metadata) => {
    if (fromOrDefinition && typeof fromOrDefinition === "object") {
      return modelAddEdge(fromOrDefinition);
    }
    modelAddEdge({
      from: { node: fromOrDefinition, port: fromPort },
      to: { node: toNode, port: toPort },
      ...(metadata === undefined ? {} : { metadata }),
    });
    return model;
  };

  /**
   * Concise alias over `addIIP` matching the old graph API. Does not shadow
   * the native method.
   *
   * @param {any} data
   * @param {string} [toNode]
   * @param {string} [toPort]
   * @param {Object<string, any>} [metadata]
   */
  model.addInitial = (data, toNode, toPort, metadata) => {
    model.addIIP({
      data,
      to: {
        node: /** @type {string} */ (toNode),
        port: /** @type {string} */ (toPort),
      },
      ...(metadata === undefined ? {} : { metadata }),
    });
    return model;
  };

  /**
   * Concise alias over IIP lookup + removal matching the old graph API.
   *
   * @param {string} toNode
   * @param {string} toPort
   */
  model.removeInitial = (toNode, toPort) => {
    const match = model
      .iips()
      .find(
        (iip) =>
          iip.to.node === toNode &&
          iip.to.port === toPort &&
          iip.to.index === undefined,
      );
    if (match) {
      model.removeIIP(match.entity_id);
    }
    return model;
  };

  /**
   * @param {any} fromOrDefinition
   * @param {any} [fromPort]
   * @param {any} [toNode]
   * @param {any} [toPort]
   */
  model.removeEdge = (fromOrDefinition, fromPort, toNode, toPort) => {
    if (fromOrDefinition && typeof fromOrDefinition === "object") {
      return modelRemoveEdge(fromOrDefinition.entity_id);
    }
    if (
      typeof fromOrDefinition === "string" &&
      fromPort === undefined &&
      toNode === undefined &&
      toPort === undefined
    ) {
      // Single string argument: an entity_id
      return modelRemoveEdge(fromOrDefinition);
    }
    const match = model
      .edges()
      .find(
        (edge) =>
          edge.from.node === fromOrDefinition &&
          edge.from.port === fromPort &&
          edge.to.node === toNode &&
          edge.to.port === toPort &&
          edge.from.index === undefined &&
          edge.to.index === undefined,
      );
    if (match) {
      modelRemoveEdge(match.entity_id);
    }
    return model;
  };

  /**
   * Concise alias for adding an exported inport matching the old graph API.
   *
   * @param {string} publicName
   * @param {string} nodeName
   * @param {string} portName
   */
  model.addInport = (publicName, nodeName, portName) => {
    model.addExport({
      direction: "inport",
      public: publicName,
      internal: { node: nodeName, port: portName },
    });
    return model;
  };

  /**
   * Concise alias for adding an exported outport matching the old graph API.
   *
   * @param {string} publicName
   * @param {string} nodeName
   * @param {string} portName
   */
  model.addOutport = (publicName, nodeName, portName) => {
    model.addExport({
      direction: "outport",
      public: publicName,
      internal: { node: nodeName, port: portName },
    });
    return model;
  };

  /**
   * @param {any} nodeOrId
   */
  model.removeNode = (nodeOrId) => {
    if (typeof nodeOrId === "object") {
      return modelRemoveNode(nodeOrId.entity_id);
    }
    return modelRemoveNode(nodeOrId);
  };

  return model;
}
